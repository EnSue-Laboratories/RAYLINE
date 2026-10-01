/**
 * Public entry for persistent PTY sessions (node-pty), exposed to the
 * renderer over IPC (main.ts) and to the MCP terminal server / CLI over a
 * local WebSocket. Implementation: electron/services/terminal/.
 */

import path from "node:path";
import { toUnpackedPath } from "./unpacked-path";
import { PtySessionRegistry } from "./services/terminal/pty-sessions";
import type { SupportPaths } from "./services/terminal/shell-env";
import { TerminalWsServer } from "./services/terminal/ws-server";

function supportPaths(): SupportPaths {
  // Bundled to dist-electron/electron/, next to the copied vendor/ and shell-init/.
  const root = toUnpackedPath(__dirname);
  return { shellInitRoot: path.join(root, "shell-init"), vendorRoot: path.join(root, "vendor") };
}

const registry = new PtySessionRegistry(supportPaths);
const server = new TerminalWsServer(registry);

registry.onOutput((name, data) => server.broadcast({ type: "output", name, data }));
registry.onExit((name, exitCode) => server.broadcast({ type: "session_exited", name, exitCode }));

export const createSession = registry.createSession.bind(registry);
export const sendInput = registry.sendInput.bind(registry);
export const readOutput = registry.readOutput.bind(registry);
export const killSession = registry.killSession.bind(registry);
export const listSessions = registry.listSessions.bind(registry);
export const resizeSession = registry.resizeSession.bind(registry);
export const getSessionMetadata = registry.getSessionMetadata.bind(registry);
/**
 * Renderer output sink. Pass `{ batchMs: 16 }` to receive at most one
 * (concatenated) chunk per session per frame; pending output is flushed
 * before that session's exit/kill state callback.
 */
export const setOutputCallback = registry.setOutputCallback.bind(registry);
export const setSessionStateCallback = registry.setSessionStateCallback.bind(registry);

/** Start the WebSocket server on 127.0.0.1; resolves to the bound port. */
export function startServer(): Promise<number> {
  return server.start();
}

/** Kill every session and shut down the WebSocket server. */
export function stopServer(): Promise<void> {
  registry.killAll();
  return server.stop();
}

/** The WebSocket server's port, or null when it isn't running. */
export function getPort(): number | null {
  return server.getPort();
}

export { MAX_SESSIONS } from "./services/terminal/pty-sessions";
export type { OutputCallbackOptions, SessionStateCallback } from "./services/terminal/pty-sessions";
export { createOutputCoalescer, type OutputCoalescer } from "./services/terminal/output-coalescer";
export { consumeSavedSessionMetadata, saveSessionMetadataSync } from "./services/terminal/metadata";
