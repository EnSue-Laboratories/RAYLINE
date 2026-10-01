/** `project-clone`: prefers `gh repo clone`, falls back to `git clone`. Never rejects. */

import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { CloneRepoRequest, CloneRepoResult } from "@shared/git/types";
import { buildSpawnPath } from "../cli-bin-resolver";
import { deriveRepoDirName, normalizeCloneUrl, toGhOwnerRepo } from "./git-parse";

const CLONE_TIMEOUT_MS = 300000;

type RunResult = { ok: true } | { ok: false; stderr: string };

function run(bin: string, args: string[], cwd: string): Promise<RunResult> {
  return new Promise((resolve) => {
    execFile(
      bin,
      args,
      { cwd, env: { ...process.env, PATH: buildSpawnPath() }, timeout: CLONE_TIMEOUT_MS, encoding: "utf-8" },
      (err, _stdout, stderr) => {
        if (err) resolve({ ok: false, stderr: (stderr || err.message || "").trim() });
        else resolve({ ok: true });
      },
    );
  });
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function cloneRepo(request: Partial<CloneRepoRequest> | null | undefined): Promise<CloneRepoResult> {
  const rawUrl = request?.url;
  const parentDir = request?.parentDir;
  if (!rawUrl || !parentDir) return { ok: false, stderr: "Missing url or parentDir" };
  if (!(await exists(parentDir))) return { ok: false, stderr: `Parent directory does not exist: ${parentDir}` };
  const url = normalizeCloneUrl(rawUrl);
  const name = deriveRepoDirName(url);
  if (!name) return { ok: false, stderr: "Could not determine repo name from URL" };
  const destPath = path.join(parentDir, name);
  if (await exists(destPath)) return { ok: false, stderr: `Destination already exists: ${destPath}` };

  const ghOwnerRepo = toGhOwnerRepo(url);
  let result: RunResult;
  if (ghOwnerRepo) {
    result = await run("gh", ["repo", "clone", ghOwnerRepo, destPath], parentDir);
    if (!result.ok) {
      const ghError = result.stderr;
      const fallback = await run("git", ["clone", url, destPath], parentDir);
      result = fallback.ok ? fallback : { ok: false, stderr: `gh: ${ghError}\ngit: ${fallback.stderr}` };
    }
  } else {
    result = await run("git", ["clone", url, destPath], parentDir);
  }
  return result.ok ? { ok: true, path: destPath } : { ok: false, stderr: result.stderr };
}
