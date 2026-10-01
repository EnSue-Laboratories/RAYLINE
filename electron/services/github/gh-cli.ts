/** Async `gh` CLI runner (resolved binary, PATH fix-ups, stdin variants). */

import { createLogger } from "../../logger";
import { buildSpawnPath, execFileCli, isExecutable, resolveCliBin, spawnCli } from "../../cli-bin-resolver";

export const log = createLogger("github-manager");

const GH_TIMEOUT_MS = 15_000;
const GH_MAX_BUFFER = 5 * 1024 * 1024;

let cachedGhBin: string | null = null;

export function resolveGhBin(): string {
  if (cachedGhBin && isExecutable(cachedGhBin)) return cachedGhBin;
  cachedGhBin = resolveCliBin("gh", { envVarName: "GH_BIN" });
  if (!cachedGhBin) {
    throw new Error("GitHub CLI (gh) not found. Install it from https://cli.github.com and ensure it is on your PATH.");
  }
  return cachedGhBin;
}

export function ghEnv(): NodeJS.ProcessEnv {
  return { ...process.env, PATH: buildSpawnPath(), GH_NO_UPDATE_NOTIFIER: "1" };
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Run gh; resolves trimmed stdout, rejects with gh's stderr. */
export function gh(args: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    let bin: string;
    try {
      bin = resolveGhBin();
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    execFileCli(bin, args, { env: ghEnv(), timeout: GH_TIMEOUT_MS, maxBuffer: GH_MAX_BUFFER, encoding: "utf8" }, (err, stdout, stderr) => {
      if (err) reject(new Error(String(stderr).trim() || err.message));
      else resolve(String(stdout).trim());
    });
  });
}

/** Run gh with `input` piped to stdin. */
export function ghWithInput(args: readonly string[], input: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let bin: string;
    try {
      bin = resolveGhBin();
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    const child = spawnCli(bin, args, { env: ghEnv(), stdio: ["pipe", "pipe", "pipe"], timeout: GH_TIMEOUT_MS });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d: Buffer | string) => {
      stdout += String(d);
    });
    child.stderr?.on("data", (d: Buffer | string) => {
      stderr += String(d);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(stderr.trim() || `gh exited with code ${code}`));
      else resolve(stdout.trim());
    });
    child.stdin?.write(input);
    child.stdin?.end();
  });
}

/** Run gh with a JSON body on stdin (`--input -`). */
export function ghWithJson(args: readonly string[], body: unknown): Promise<string> {
  return ghWithInput(args, JSON.stringify(body));
}

/** Parse gh JSON output and validate it. */
export function parseGhJson<T>(raw: string, guard: (value: unknown) => value is T, what: string): T {
  const parsed: unknown = JSON.parse(raw);
  if (!guard(parsed)) throw new Error(`Unexpected ${what} response from gh`);
  return parsed;
}

/** Parse a gh JSON array, dropping entries that fail validation. */
export function parseGhJsonArray<T>(raw: string, guard: (value: unknown) => value is T, what: string): T[] {
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error(`Unexpected ${what} response from gh`);
  return (parsed as unknown[]).filter(guard);
}
