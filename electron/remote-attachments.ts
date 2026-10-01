/**
 * Uploads chat attachments to a remote SSH host (into a private
 * `/tmp/rayline-attachments-*` directory) before a remote Claude / Codex run,
 * and removes them afterwards. Pure path/name helpers live in
 * providers/remote/attachment-names.
 */

import type { ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { FileAttachment } from "@shared/chat/types";
import type { NormalizedRemoteRuntime } from "@shared/providers/types";
import { buildSpawnPath } from "./cli-bin-resolver";
import { normalizeRemoteRuntime, spawnRemoteCommand } from "./remote-runtime";
import type { ImageInput } from "./providers/common/images";
import {
  REMOTE_ATTACHMENT_DIR_PREFIX,
  extensionForMime,
  parseBase64DataUrl,
  quotePosix,
  remotePathInDir,
  safeRemoteFilename,
} from "./providers/remote/attachment-names";

export interface RemoteAttachmentInputs {
  images?: readonly ImageInput[] | null;
  files?: readonly FileAttachment[] | null;
}

/** A local file attachment re-pointed at its uploaded remote copy. */
export interface StagedRemoteFile extends FileAttachment {
  path: string;
  originalPath: string;
}

export interface StagedRemoteAttachments {
  /** Remote paths of uploaded images. */
  images: string[];
  files: StagedRemoteFile[];
  /** "" when nothing was uploaded. */
  remoteDir: string;
  cleanup: () => Promise<void>;
}

type UploadSource = { localPath: string } | { buffer: Buffer };

function createRemoteAttachmentDir(): string {
  const suffix = [process.pid, Date.now(), crypto.randomBytes(6).toString("hex")].join("-");
  return `${REMOTE_ATTACHMENT_DIR_PREFIX}${suffix}`;
}

function spawnRemoteShell(remote: NormalizedRemoteRuntime, script: string): ChildProcess {
  return spawnRemoteCommand(remote, "sh", ["-lc", script], {
    cwd: process.cwd(),
    env: { ...process.env, PATH: buildSpawnPath() },
    stdio: ["pipe", "pipe", "pipe"],
  });
}

function waitForRemoteProcess(child: ChildProcess, label: string): Promise<string> {
  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", (chunk: Buffer) => {
    stdout += chunk.toString();
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (exitCode: number | null, signal: NodeJS.Signals | null) => {
      if (exitCode === 0) {
        resolve(stdout);
        return;
      }
      const detail = stderr.trim() || stdout.trim() || `${label} failed with ${signal || `exit code ${exitCode}`}`;
      reject(new Error(detail));
    });
  });
}

async function uploadRemoteInput(
  remote: NormalizedRemoteRuntime,
  remoteDir: string,
  remotePath: string,
  source: UploadSource,
): Promise<void> {
  const script = `umask 077; mkdir -p ${quotePosix(remoteDir)} && cat > ${quotePosix(remotePath)}`;
  const child = spawnRemoteShell(remote, script);
  const closePromise = waitForRemoteProcess(child, `Upload ${remotePath}`);
  const stdin = child.stdin;
  stdin?.on("error", () => {});

  try {
    if (!stdin) throw new Error(`Upload ${remotePath}: remote shell has no stdin`);
    if ("localPath" in source) {
      await pipeline(fs.createReadStream(source.localPath), stdin);
    } else {
      stdin.end(source.buffer);
    }
  } catch (error) {
    closePromise.catch(() => {});
    child.kill("SIGTERM");
    throw error;
  }

  await closePromise;
}

export async function cleanupRemoteAttachmentDir(remoteRuntime: unknown, remoteDir: string): Promise<void> {
  const remote = normalizeRemoteRuntime(remoteRuntime);
  if (!remote || !remoteDir.startsWith(REMOTE_ATTACHMENT_DIR_PREFIX)) return;
  const child = spawnRemoteShell(remote, `rm -rf ${quotePosix(remoteDir)}`);
  child.stdin?.on("error", () => {});
  child.stdin?.end();
  await waitForRemoteProcess(child, `Cleanup ${remoteDir}`);
}

export async function stageRemoteAttachments(
  remoteRuntime: unknown,
  attachments: RemoteAttachmentInputs = {},
): Promise<StagedRemoteAttachments | null> {
  const remote = normalizeRemoteRuntime(remoteRuntime);
  if (!remote) return null;

  const imageInputs = attachments.images ?? [];
  const fileInputs = attachments.files ?? [];
  if (imageInputs.length === 0 && fileInputs.length === 0) {
    return { images: [], files: [], remoteDir: "", cleanup: async () => {} };
  }

  const remoteDir = createRemoteAttachmentDir();
  const stagedImages: string[] = [];
  const stagedFiles: StagedRemoteFile[] = [];

  try {
    for (const [i, image] of imageInputs.entries()) {
      const parsed = parseBase64DataUrl(image);
      if (!parsed) continue;
      const sourceName = typeof image === "object" ? image.name : "";
      const filename = safeRemoteFilename(sourceName, `image-${i + 1}.${extensionForMime(parsed.mime)}`);
      const remotePath = remotePathInDir(remoteDir, i, filename);
      await uploadRemoteInput(remote, remoteDir, remotePath, { buffer: parsed.buffer });
      stagedImages.push(remotePath);
    }

    for (const [i, file] of fileInputs.entries()) {
      const localPath = typeof file.path === "string" ? file.path : "";
      if (!localPath) continue;
      const stat = await fs.promises.stat(localPath);
      if (!stat.isFile()) throw new Error(`Attached file is not a regular file: ${localPath}`);

      const filename = safeRemoteFilename(file.name || path.basename(localPath), `file-${i + 1}`);
      const remotePath = remotePathInDir(remoteDir, stagedImages.length + i, filename);
      await uploadRemoteInput(remote, remoteDir, remotePath, { localPath });
      stagedFiles.push({ ...file, path: remotePath, originalPath: localPath });
    }
  } catch (error) {
    await cleanupRemoteAttachmentDir(remote, remoteDir).catch(() => {});
    throw error;
  }

  return {
    images: stagedImages,
    files: stagedFiles,
    remoteDir,
    cleanup: () => cleanupRemoteAttachmentDir(remote, remoteDir),
  };
}
