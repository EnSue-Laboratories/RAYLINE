/**
 * Wires terminal-manager to the windows: starts the session WebSocket
 * server (+ the MCP config agents use to reach it), forwards PTY output to
 * subscribed windows coalesced per session, and reveals new sessions.
 */

import fs from "node:fs";
import { app, webContents as allWebContents } from "electron";
import type { TerminalSessionsStatePayload } from "@shared/terminal/types";
import { broadcast, sendTo } from "../ipc/typed";
import { createLogger } from "../logger";
import { toUnpackedPath } from "../paths";
import { setTerminalBridgeInfo } from "../providers/common/terminal-bridge-info";
import * as terminalManager from "../terminal-manager";
import type { AppContext, TerminalRuntimeInfo } from "./context";
import { isTerminalWindowOpen, revealTerminalSurface } from "./terminal-window";

const log = createLogger("main");

/** One IPC message per session per frame instead of one per PTY chunk (PERF.md). */
const OUTPUT_BATCH_MS = 16;

interface McpServerEntry {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

/**
 * MCP server launch command. Packaged builds run the bundled script with the
 * app's own Electron binary as Node (`ELECTRON_RUN_AS_NODE`), so no system
 * `node` is required (ported from PR #230); dev keeps the system `node`.
 */
export function buildMcpServerEntry(scriptPath: string, port: number, packaged: boolean): McpServerEntry {
  const args = [toUnpackedPath(scriptPath), String(port)];
  return packaged
    ? { command: process.execPath, args, env: { ELECTRON_RUN_AS_NODE: "1" } }
    : { command: "node", args };
}

async function startTerminalServer(ctx: AppContext): Promise<TerminalRuntimeInfo> {
  const port = await terminalManager.startServer();
  log("Terminal WebSocket server on port", port);
  const mcpConfig = {
    mcpServers: { "terminal-sessions": buildMcpServerEntry(ctx.paths.mcpTerminalServerScript, port, app.isPackaged) },
  };
  await fs.promises.writeFile(ctx.paths.mcpConfigFile, JSON.stringify(mcpConfig, null, 2));
  const info: TerminalRuntimeInfo = { wsPort: port, mcpConfigPath: ctx.paths.mcpConfigFile };
  ctx.terminalRuntime = info;
  setTerminalBridgeInfo(info);
  return info;
}

function onSessionsState(ctx: AppContext, payload: TerminalSessionsStatePayload): void {
  const ui = ctx.terminalUi;
  if (payload.reason === "created" && payload.name) {
    ui.pendingPreferredSessionName = payload.name;
  } else if (!payload.sessions.some((session) => session.name === ui.pendingPreferredSessionName)) {
    ui.pendingPreferredSessionName = null;
  }

  broadcast("terminal-sessions-state", payload);

  if (payload.sessions.length === 0) {
    if (isTerminalWindowOpen(ctx)) ctx.windows.terminal?.close();
    return;
  }
  if (payload.reason === "created") revealTerminalSurface(ctx, payload);
}

export function startTerminalBridge(ctx: AppContext): void {
  startTerminalServer(ctx).catch((error: unknown) => console.error("[terminal] failed to start session server:", error));

  const subscribers = ctx.terminalUi.outputSubscribers;
  terminalManager.setOutputCallback((name, data) => {
    for (const id of subscribers) {
      const target = allWebContents.fromId(id);
      if (target) sendTo(target, "terminal-output", { name, data });
      else subscribers.delete(id);
    }
  }, { batchMs: OUTPUT_BATCH_MS });
  terminalManager.setSessionStateCallback((payload) => onSessionsState(ctx, payload));
}
