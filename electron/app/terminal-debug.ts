/** Opt-in terminal window diagnostics (`RAYLINE_TERMINAL_DEBUG=1` or `RAYLINE_DEBUG=terminal-debug`). */

import type { BrowserWindow } from "electron";
import { isTruthyFlag, isVerboseLoggingEnabled } from "../logger";
import { describeWindow } from "./window-chrome";

export const TERMINAL_DEBUG_ENABLED =
  isVerboseLoggingEnabled("terminal-debug") || isTruthyFlag(process.env.RAYLINE_TERMINAL_DEBUG);

export function terminalDebug(event: string, details: unknown = {}, meta: Record<string, unknown> = {}): void {
  if (!TERMINAL_DEBUG_ENABLED) return;
  console.log(`[terminal-debug] ${JSON.stringify({ ts: new Date().toISOString(), event, ...meta, details })}`);
}

const WINDOW_EVENTS = [
  "ready-to-show",
  "show",
  "hide",
  "focus",
  "blur",
  "resize",
  "move",
  "maximize",
  "unmaximize",
  "enter-full-screen",
  "leave-full-screen",
] as const;

export function attachTerminalWindowDebug(win: BrowserWindow): void {
  if (!TERMINAL_DEBUG_ENABLED) return;
  const emitter: NodeJS.EventEmitter = win;
  for (const eventName of WINDOW_EVENTS) {
    emitter.on(eventName, () => {
      terminalDebug(`terminal-window:${eventName}`, describeWindow(win), { source: "main" });
    });
  }
  win.webContents.on("did-finish-load", () => {
    terminalDebug("terminal-window:did-finish-load", { ...describeWindow(win), url: win.webContents.getURL() }, { source: "main" });
  });
  win.webContents.on("render-process-gone", (_event, details) => {
    terminalDebug("terminal-window:render-process-gone", details, { source: "main" });
  });
}
