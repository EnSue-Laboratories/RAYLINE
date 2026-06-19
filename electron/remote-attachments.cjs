"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { pipeline } = require("stream/promises");
const { buildSpawnPath } = require("./cli-bin-resolver.cjs");
const { normalizeRemoteRuntime, spawnRemoteCommand } = require("./remote-runtime.cjs");

const REMOTE_ATTACHMENT_DIR_PREFIX = "/tmp/rayline-attachments-";

function quotePosix(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function safeFilename(value, fallback) {
  const raw = path.basename(typeof value === "string" && value.trim() ? value.trim() : fallback);
  const cleaned = raw
    .replace(/[^\w.+-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
  if (!cleaned || cleaned === "." || cleaned === "..") return fallback;
  return cleaned;
}

function extensionForMime(mime) {
  const normalized = String(mime || "").toLowerCase();
  if (normalized === "image/jpeg") return "jpg";
  if (normalized === "image/png") return "png";
  if (normalized === "image/gif") return "gif";
  if (normalized === "image/webp") return "webp";
  if (normalized === "image/svg+xml") return "svg";
  const match = normalized.match(/^image\/([a-z0-9.+-]+)$/);
  return match ? match[1].replace(/[^a-z0-9.+-]/g, "") || "png" : "png";
}

function parseImageDataUrl(image) {
  const dataUrl = typeof image === "string" ? image : image?.dataUrl;
  if (typeof dataUrl !== "string") return null;
  const match = dataUrl.match(/^data:([^;,]+);base64,([\s\S]+)$/i);
  if (!match) return null;
  return {
    mime: match[1],
    buffer: Buffer.from(match[2].replace(/\s+/g, ""), "base64"),
  };
}

function createRemoteAttachmentDir() {
  const suffix = [
    process.pid,
    Date.now(),
    crypto.randomBytes(6).toString("hex"),
  ].join("-");
  return `${REMOTE_ATTACHMENT_DIR_PREFIX}${suffix}`;
}

function remotePathInDir(remoteDir, index, filename) {
  const prefix = String(index + 1).padStart(2, "0");
  return `${remoteDir}/${prefix}-${filename}`;
}

function spawnRemoteShell(remote, script) {
  return spawnRemoteCommand(remote, "sh", ["-lc", script], {
    cwd: process.cwd(),
    env: { ...process.env, PATH: buildSpawnPath() },
    stdio: ["pipe", "pipe", "pipe"],
  });
}

function waitForRemoteProcess(child, label) {
  let stdout = "";
  let stderr = "";

  child.stdout?.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr?.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (exitCode, signal) => {
      if (exitCode === 0) {
        resolve(stdout);
        return;
      }
      const detail = stderr.trim() || stdout.trim() || `${label} failed with ${signal || `exit code ${exitCode}`}`;
      reject(new Error(detail));
    });
  });
}

async function uploadRemoteInput(remote, remoteDir, remotePath, input) {
  const script = `umask 077; mkdir -p ${quotePosix(remoteDir)} && cat > ${quotePosix(remotePath)}`;
  const child = spawnRemoteShell(remote, script);
  const closePromise = waitForRemoteProcess(child, `Upload ${remotePath}`);
  child.stdin?.on("error", () => {});

  try {
    if (input?.localPath) {
      await pipeline(fs.createReadStream(input.localPath), child.stdin);
    } else {
      child.stdin.end(input?.buffer || Buffer.alloc(0));
    }
  } catch (error) {
    closePromise.catch(() => {});
    child.kill("SIGTERM");
    throw error;
  }

  await closePromise;
}

async function cleanupRemoteAttachmentDir(remoteRuntime, remoteDir) {
  const remote = normalizeRemoteRuntime(remoteRuntime);
  if (!remote || typeof remoteDir !== "string" || !remoteDir.startsWith(REMOTE_ATTACHMENT_DIR_PREFIX)) return;
  const child = spawnRemoteShell(remote, `rm -rf ${quotePosix(remoteDir)}`);
  child.stdin?.on("error", () => {});
  child.stdin?.end();
  await waitForRemoteProcess(child, `Cleanup ${remoteDir}`);
}

async function stageRemoteAttachments(remoteRuntime, attachments = {}) {
  const remote = normalizeRemoteRuntime(remoteRuntime);
  if (!remote) return null;

  const imageInputs = Array.isArray(attachments.images) ? attachments.images : [];
  const fileInputs = Array.isArray(attachments.files) ? attachments.files : [];
  if (imageInputs.length === 0 && fileInputs.length === 0) {
    return {
      images: [],
      files: [],
      remoteDir: "",
      cleanup: async () => {},
    };
  }

  const remoteDir = createRemoteAttachmentDir();
  const stagedImages = [];
  const stagedFiles = [];

  try {
    for (let i = 0; i < imageInputs.length; i += 1) {
      const parsed = parseImageDataUrl(imageInputs[i]);
      if (!parsed) continue;
      const sourceName = typeof imageInputs[i] === "object" ? imageInputs[i].name : "";
      const filename = safeFilename(sourceName, `image-${i + 1}.${extensionForMime(parsed.mime)}`);
      const remotePath = remotePathInDir(remoteDir, i, filename);
      await uploadRemoteInput(remote, remoteDir, remotePath, { buffer: parsed.buffer });
      stagedImages.push(remotePath);
    }

    for (let i = 0; i < fileInputs.length; i += 1) {
      const file = fileInputs[i] || {};
      const localPath = typeof file.path === "string" ? file.path : "";
      if (!localPath) continue;
      const stat = await fs.promises.stat(localPath);
      if (!stat.isFile()) {
        throw new Error(`Attached file is not a regular file: ${localPath}`);
      }

      const filename = safeFilename(file.name || path.basename(localPath), `file-${i + 1}`);
      const remotePath = remotePathInDir(remoteDir, stagedImages.length + i, filename);
      await uploadRemoteInput(remote, remoteDir, remotePath, { localPath });
      stagedFiles.push({
        ...file,
        path: remotePath,
        originalPath: localPath,
      });
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

module.exports = {
  cleanupRemoteAttachmentDir,
  stageRemoteAttachments,
};
