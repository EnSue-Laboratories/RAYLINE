/** Async git / gh process helpers (never block the main thread). */

import { execFile } from "node:child_process";
import { buildSpawnPath } from "../cli-bin-resolver";

export interface ExecTextOptions {
  timeout?: number;
  maxBuffer?: number;
  env?: NodeJS.ProcessEnv;
}

/** Runs a command; resolves trimmed stdout, rejects with stderr (or the exec error) as message. */
export function execText(file: string, args: readonly string[], cwd: string | undefined, options: ExecTextOptions = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      { cwd, env: options.env, timeout: options.timeout, maxBuffer: options.maxBuffer, encoding: "utf-8" },
      (error, stdout, stderr) => {
        if (error) reject(new Error(stderr.trim() || error.message));
        else resolve(stdout.trim());
      },
    );
  });
}

const gitEnv = (): NodeJS.ProcessEnv => ({ ...process.env, GIT_TERMINAL_PROMPT: "0" });

/** Short git command (10 s timeout). */
export function git(args: readonly string[], cwd: string): Promise<string> {
  return execText("git", args, cwd, { env: gitEnv(), timeout: 10000 });
}

/** Network / heavy git command (60 s timeout, 10 MiB buffer). */
export function gitLong(args: readonly string[], cwd: string): Promise<string> {
  return execText("git", args, cwd, { env: gitEnv(), timeout: 60000, maxBuffer: 10 * 1024 * 1024 });
}

/** `gh` with the GUI-safe PATH (packaged apps don't inherit the shell PATH). */
export function gh(args: readonly string[], cwd: string | undefined, options: ExecTextOptions = {}): Promise<string> {
  return execText("gh", args, cwd, {
    timeout: options.timeout ?? 15000,
    maxBuffer: options.maxBuffer ?? 10 * 1024 * 1024,
    env: { ...process.env, PATH: buildSpawnPath() },
  });
}
