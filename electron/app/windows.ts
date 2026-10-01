/** Main and Project Manager windows. */

import { shell, type BrowserWindow } from "electron";
import { initAutoUpdater } from "../auto-updater";
import type { AppContext } from "./context";
import { createChromeWindow, isOpen, loadRendererPage, showWindowWhenReady } from "./window-chrome";

export function createMainWindow(ctx: AppContext): BrowserWindow {
  const win = createChromeWindow(ctx, {
    title: "RayLine",
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    preload: ctx.paths.preloadMain,
  });
  ctx.windows.main = win;
  showWindowWhenReady(win);

  // In-app navigation stays on the app origin; everything else opens in the system browser.
  const appUrl = ctx.env.isDev ? `http://localhost:${ctx.env.devServerPort}` : "file://";
  win.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith(appUrl)) return;
    event.preventDefault();
    void shell.openExternal(url);
  });

  initAutoUpdater(win);

  if (ctx.env.isDev) {
    win.webContents.on("before-input-event", (event, input) => {
      if (input.key === "F12" && input.type === "keyDown") {
        win.webContents.toggleDevTools();
        event.preventDefault();
      }
    });
  }
  loadRendererPage(ctx, win, "index.html");

  win.on("closed", () => {
    if (ctx.windows.main === win) ctx.windows.main = null;
  });
  return win;
}

export function createProjectManagerWindow(ctx: AppContext): BrowserWindow {
  const existing = ctx.windows.pm;
  if (isOpen(existing)) {
    existing.focus();
    return existing;
  }
  const win = createChromeWindow(ctx, {
    title: "GitHub Projects",
    width: 1000,
    height: 700,
    minWidth: 700,
    minHeight: 500,
    preload: ctx.paths.preloadProjectManager,
  });
  ctx.windows.pm = win;
  showWindowWhenReady(win);
  loadRendererPage(ctx, win, "src/project-manager.html");
  win.on("closed", () => {
    if (ctx.windows.pm === win) ctx.windows.pm = null;
  });
  return win;
}
