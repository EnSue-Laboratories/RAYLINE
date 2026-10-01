/** Async git runner for checkpoints (never throws on non-zero exit). */

import { execFile } from "node:child_process";
import { createLogger } from "../terminal/deps";

export const log = createLogger("checkpoint");

export interface GitResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Large repos can produce sizable tree output. */
const MAX_BUFFER = 100 * 1024 * 1024;

/**
 * Run git in `cwdPath`; `envOverrides` are merged over the process env.
 * Resolves with the exit code instead of rejecting.
 */
export function execGit(args: readonly string[], cwdPath: string, envOverrides: Record<string, string> = {}): Promise<GitResult> {
  return new Promise((resolve) => {
    execFile(
      "git",
      [...args],
      { cwd: cwdPath, env: { ...process.env, ...envOverrides }, maxBuffer: MAX_BUFFER, encoding: "utf8" },
      (err, stdout, stderr) => {
        const code = err ? (err as NodeJS.ErrnoException & { code?: unknown }).code : 0;
        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: typeof code === "number" ? code : err ? 1 : 0,
        });
      },
    );
  });
}

/** Throw `[checkpoint] <what> failed:\n<stderr>` unless git succeeded. */
export function assertGit(result: GitResult, what: string): string {
  if (result.exitCode !== 0) throw new Error(`[checkpoint] ${what} failed:\n${result.stderr}`);
  return result.stdout;
}

const RAYLINE_INIT_ENV = {
  GIT_AUTHOR_NAME: "RayLine",
  GIT_AUTHOR_EMAIL: "rayline@noreply",
  GIT_COMMITTER_NAME: "RayLine",
  GIT_COMMITTER_EMAIL: "rayline@noreply",
};

/** Repo root for `cwdPath`; initializes a repo (with an initial commit) if there is none. */
export async function resolveRepoRoot(cwdPath: string): Promise<string> {
  const repoRootResult = await execGit(["rev-parse", "--show-toplevel"], cwdPath);
  if (repoRootResult.exitCode === 0) return repoRootResult.stdout;

  log("No git repo found, initializing:", cwdPath);
  const initResult = await execGit(["init"], cwdPath);
  if (initResult.exitCode !== 0) {
    throw new Error(`[checkpoint] Failed to init git repo: ${cwdPath}\n${initResult.stderr}`);
  }
  // Initial commit so HEAD exists.
  await execGit(["add", "-A", "--", "."], cwdPath);
  await execGit(["commit", "--allow-empty", "-m", "rayline: initial checkpoint"], cwdPath, RAYLINE_INIT_ENV);
  log("Git repo initialized:", cwdPath);
  return cwdPath;
}
