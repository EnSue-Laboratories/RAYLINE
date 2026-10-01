/**
 * The standalone terminal window and where new sessions are revealed:
 * the main window's sidebar terminal (when the user enabled it) or the
 * terminal window.
 */

import type { BrowserWindow } from "electron";
import type { TerminalSessionsStatePayload } from "@shared/terminal/types";
import { broadcast, sendToWindow } from "../ipc/typed";
import type { AppContext } from "./context";
import { attachTerminalWindowDebug, terminalDebug } from "./terminal-debug";
import { createChromeWindow, describeWindow, focusWindow, isOpen, loadRendererPage } from "./window-chrome";

export function isTerminalWindowOpen(ctx: AppContext): boolean {
  return isOpen(ctx.windows.terminal);
}

export function broadcastTerminalWindowState(ctx: AppContext): void {
  broadcast("terminal-window-state", { open: isTerminalWindowOpen(ctx) });
}

function clearRevealTimer(ctx: AppContext): void {
  if (!ctx.terminalUi.revealTimer) return;
  clearTimeout(ctx.terminalUi.revealTimer);
  ctx.terminalUi.revealTimer = null;
}

export function revealTerminalWindow(ctx: AppContext, reason = "unknown"): void {
  const win = ctx.windows.terminal;
  if (!isOpen(win)) return;
  clearRevealTimer(ctx);
  if (!win.isVisible()) win.show();
  win.focus();
  terminalDebug("terminal-window:revealed", { reason, ...describeWindow(win) }, { source: "main" });
}

export function createTerminalWindow(ctx: AppContext): BrowserWindow {
  const existing = ctx.windows.terminal;
  if (isOpen(existing)) {
    if (existing.isMinimized()) existing.restore();
    revealTerminalWindow(ctx, "existing-window");
    broadcastTerminalWindowState(ctx);
    return existing;
  }

  const win = createChromeWindow(ctx, {
    title: "Terminals",
    width: 960,
    height: 760,
    minWidth: 560,
    minHeight: 320,
    preload: ctx.paths.preloadMain,
  });
  ctx.windows.terminal = win;
  attachTerminalWindowDebug(win);
  loadRendererPage(ctx, win, "src/terminal-window.html");

  clearRevealTimer(ctx);
  ctx.terminalUi.revealTimer = setTimeout(() => revealTerminalWindow(ctx, "startup-timeout"), ctx.env.isDev ? 2500 : 1500);

  win.on("closed", () => {
    clearRevealTimer(ctx);
    if (ctx.windows.terminal === win) ctx.windows.terminal = null;
    broadcastTerminalWindowState(ctx);
  });

  broadcastTerminalWindowState(ctx);
  return win;
}

function revealSidebarTerminal(ctx: AppContext, name: string | undefined): void {
  const main = ctx.windows.main;
  if (!isOpen(main)) {
    createTerminalWindow(ctx);
    return;
  }
  focusWindow(main);
  sendToWindow(main, "terminal-sidebar-reveal-request", { name: name || null });
}

/** Shows a newly created session where the user expects it (`reveal`: false | true | "auto" | "sidebar"). */
export function revealTerminalSurface(ctx: AppContext, payload: Pick<TerminalSessionsStatePayload, "reveal" | "name">): void {
  // terminal-manager forwards whatever the creator passed; "sidebar" predates the typed contract.
  const reveal: unknown = payload.reveal;
  if (reveal === false) return;
  const isAutoReveal = reveal === undefined || reveal === null || reveal === "auto";
  if (reveal === "sidebar" || (isAutoReveal && ctx.terminalUi.sidebarEnabledPreference)) {
    revealSidebarTerminal(ctx, payload.name);
    return;
  }
  createTerminalWindow(ctx);
}
