/** Claude CLI binary resolution, launch-cwd recovery and `--rewind-files`. */

import type { RewindFilesRequest } from "@shared/chat/types";
import { createLogger, findSessionCwd, spawnCli } from "../common/boundary";
import { baseCliEnv, createCliBinResolver, isDirectory } from "../common/runtime-env";
import { buildClaudeRewindArgs } from "./args";

const log = createLogger("agent-manager");

export const resolveClaudeBin = createCliBinResolver("claude", "CLAUDE_BIN");

/**
 * The requested cwd, or (when it no longer exists) the cwd recorded in the
 * Claude session file. Throws when neither is a directory.
 */
export async function resolveLaunchCwd(cwd: string | null | undefined, sessionId: string | null | undefined): Promise<string> {
  if (!cwd) return process.cwd();
  if (await isDirectory(cwd)) return cwd;
  if (sessionId) {
    const recovered = await findSessionCwd(sessionId);
    if (recovered && (await isDirectory(recovered))) {
      log("Recovered invalid cwd from session metadata", { requestedCwd: cwd, recoveredCwd: recovered, sessionId });
      return recovered;
    }
  }
  throw new Error(`Invalid working directory: ${cwd}`);
}

/** Restores files to their state at `messageUuid` (standalone `--print` run). */
export async function rewindFiles({ sessionId, messageUuid, cwd }: RewindFilesRequest): Promise<{ success: true }> {
  log("Rewinding files:", { sessionId, messageUuid, cwd });
  const claudeBin = resolveClaudeBin();
  if (!claudeBin) throw new Error("Unable to locate the Claude CLI binary");
  const launchCwd = await resolveLaunchCwd(cwd, sessionId);

  const child = spawnCli(claudeBin, buildClaudeRewindArgs(sessionId, messageUuid), {
    cwd: launchCwd,
    env: baseCliEnv(),
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", (chunk: Buffer) => {
    stdout += chunk.toString();
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  return new Promise((resolve, reject) => {
    child.on("close", (exitCode: number | null) => {
      log("Rewind finished, exitCode:", exitCode);
      if (stdout.trim()) log("Rewind stdout:", stdout.slice(0, 500));
      if (stderr.trim()) log("Rewind stderr:", stderr.slice(0, 500));
      if (exitCode === 0) resolve({ success: true });
      else reject(new Error(stderr || `Rewind failed with exit code ${exitCode}`));
    });
    child.on("error", reject);
  });
}
