/** Agent session history (Claude / Codex session files), rewind and checkpoints. */

import { agentManager } from "../app/boundaries";
import * as checkpoint from "../checkpoint";
import * as sessionReader from "../session-reader";
import { createLogger } from "../logger";
import { handle } from "./typed";

const logCheckpoint = createLogger("checkpoint-main");

async function timed<T>(label: string, details: Record<string, unknown>, run: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  logCheckpoint(label, details);
  try {
    const result = await run();
    logCheckpoint(`${label}:success`, { ...details, durationMs: Date.now() - startedAt, result });
    return result;
  } catch (error) {
    console.error(`[checkpoint-main] ${label}:failed`, { ...details, durationMs: Date.now() - startedAt, error });
    throw error;
  }
}

export function registerSessionIpc(): void {
  handle("list-sessions", (_event, cwd) => sessionReader.listSessions(cwd));
  handle("load-session", (_event, sessionId) => sessionReader.loadSessionMessages(sessionId));
  handle("load-session-search-text", (_event, sessionId) => sessionReader.loadSessionSearchText(sessionId));
  handle("move-session", (_event, sessionId, newCwd) => sessionReader.moveSessionAsync(sessionId, newCwd));
  handle("rewind-files", (_event, request) => agentManager.rewindFiles(request));

  handle("checkpoint-create", (_event, cwdPath) =>
    timed("checkpoint-create", { cwdPath }, async () => checkpoint.createCheckpoint(cwdPath)));
  handle("checkpoint-restore", (_event, cwdPath, ref) =>
    timed("checkpoint-restore", { cwdPath, ref }, async () => checkpoint.restoreCheckpoint(cwdPath, ref)));
}
