/**
 * Public entry for reading Claude / Codex CLI sessions from disk.
 * Implementation: electron/services/sessions/.
 */

import os from "node:os";
import path from "node:path";
import { createSessionReader } from "./services/sessions/reader";

const reader = createSessionReader({
  claudeDir: path.join(os.homedir(), ".claude"),
  codexDir: path.join(os.homedir(), ".codex"),
});

/** Sessions recorded for `cwd`, newest first. */
export const listSessions = reader.listSessions;
/** Last {@link MAX_MESSAGES} messages of a session (empty when not found). */
export const loadSessionMessages = reader.loadSessionMessages;
/** Flattened, cached search text for the sidebar search. */
export const loadSessionSearchText = reader.loadSessionSearchText;
/**
 * Copy a Claude session into `newCwd`'s project dir so `claude --resume`
 * finds it there. Synchronous for the agent launch path; new code should use
 * {@link moveSessionAsync}.
 */
export const moveSession = reader.moveSession;
export const moveSessionAsync = reader.moveSessionAsync;
/** cwd recorded in a Claude session. Sync for the agent launch path. */
export const findSessionCwd = reader.findSessionCwd;
export const findSessionCwdAsync = reader.findSessionCwdAsync;
/** Build the sessionId → file index in the background (call after startup). */
export const warmSessionIndex = reader.warm;

export { MAX_MESSAGES } from "./services/sessions/reader";
export type { SessionReader } from "./services/sessions/reader";
