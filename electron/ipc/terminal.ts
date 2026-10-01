/** PTY terminal sessions and the terminal window. */

import { BrowserWindow } from "electron";
import * as terminalManager from "../terminal-manager";
import { rememberTerminalSurfacePreference, type AppContext } from "../app/context";
import { TERMINAL_DEBUG_ENABLED, terminalDebug } from "../app/terminal-debug";
import { createTerminalWindow, isTerminalWindowOpen, revealTerminalWindow } from "../app/terminal-window";
import { handle, on } from "./typed";

export function registerTerminalIpc(ctx: AppContext): void {
  handle("terminal-create", (_event, options) => terminalManager.createSession(options));
  handle("terminal-send", (_event, { name, text }) => terminalManager.sendInput(name, text));
  handle("terminal-read", (_event, { name, lines }) => terminalManager.readOutput(name, lines));
  handle("terminal-kill", (_event, { name }) => terminalManager.killSession(name));
  handle("terminal-list", () => terminalManager.listSessions());
  handle("terminal-resize", (_event, { name, cols, rows }) => terminalManager.resizeSession(name, cols, rows));
  handle("terminal-metadata", () => terminalManager.getSessionMetadata());

  handle("terminal-consume-preferred-session", () => {
    const preferred = ctx.terminalUi.pendingPreferredSessionName;
    ctx.terminalUi.pendingPreferredSessionName = null;
    return preferred;
  });

  // Sessions saved at the last quit; the file is consumed on read.
  handle("terminal-saved-metadata", () => terminalManager.consumeSavedSessionMetadata(ctx.paths.terminalMetaFile));

  handle("open-terminal-window", () => {
    createTerminalWindow(ctx);
    return true as const;
  });

  handle("close-terminal-window", () => {
    if (isTerminalWindowOpen(ctx)) ctx.windows.terminal?.close();
    return true as const;
  });

  handle("is-terminal-window-open", () => isTerminalWindowOpen(ctx));

  handle("terminal-surface-preference", (_event, state) => {
    rememberTerminalSurfacePreference(ctx, state);
    return true as const;
  });

  on("terminal-debug-log", (event, payload) => {
    if (!TERMINAL_DEBUG_ENABLED) return;
    const win = BrowserWindow.fromWebContents(event.sender);
    terminalDebug(payload?.event || "renderer-log", payload?.details ?? {}, {
      source: payload?.source || "renderer",
      page: payload?.page || event.sender.getURL(),
      windowTitle: win?.getTitle() ?? null,
    });
  });

  on("terminal-output-subscribe", (event, subscribed) => {
    const subscribers = ctx.terminalUi.outputSubscribers;
    const id = event.sender.id;
    if (!subscribed) {
      subscribers.delete(id);
      return;
    }
    if (subscribers.has(id)) return;
    subscribers.add(id);
    event.sender.once("destroyed", () => subscribers.delete(id));
  });

  on("terminal-window-ready", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed() || win !== ctx.windows.terminal) return;
    revealTerminalWindow(ctx, "renderer-ready");
  });
}
