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

/** Delay before the background index build, so it doesn't compete with startup. */
const WARM_DELAY_MS = 1_500;
setTimeout(() => reader.warm(), WARM_DELAY_MS).unref();

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
/** Build the sessionId → file index now (it is also warmed automatically shortly after load). */
export const warmSessionIndex = reader.warm;

export { MAX_MESSAGES } from "./services/sessions/reader";
export type { SessionReader } from "./services/sessions/reader";
