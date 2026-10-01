/** App lifecycle: ready / activate / second-instance / window-all-closed / before-quit. */

import { app, BrowserWindow, nativeImage } from "electron";
import { resolveAppPath } from "../paths";
import { cancelAllRuntimes } from "./agent-runtimes";
import * as terminalManager from "../terminal-manager";
import type { AppContext } from "./context";
import { startTerminalBridge } from "./terminal-bridge";
import { terminalDebug } from "./terminal-debug";
import { focusWindow, isOpen } from "./window-chrome";
import { createMainWindow } from "./windows";

function setDockIcon(ctx: AppContext): void {
  if (!ctx.env.isMac || !app.dock) return;
  const icon = nativeImage.createFromPath(resolveAppPath("public", "icon.png"));
  if (!icon.isEmpty()) app.dock.setIcon(icon);
}

/** Focus (or recreate) the main window — used for `activate` and a second launch. */
function surfaceMainWindow(ctx: AppContext): void {
  const main = isOpen(ctx.windows.main) ? ctx.windows.main : createMainWindow(ctx);
  focusWindow(main);
}

export function registerAppLifecycle(ctx: AppContext): void {
  // A second launch of the packaged app focuses the running instance (PR #230).
  app.on("second-instance", () => {
    if (app.isReady()) surfaceMainWindow(ctx);
  });

  void app.whenReady().then(() => {
    terminalDebug("app:ready", {
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      platform: process.platform,
    }, { source: "main" });
    setDockIcon(ctx);
    createMainWindow(ctx);
    startTerminalBridge(ctx);
  });

  app.on("window-all-closed", () => {
    if (!ctx.env.isMac) app.quit();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow(ctx);
  });

  app.on("before-quit", () => {
    // Synchronous on purpose: the process is about to exit.
    terminalManager.saveSessionMetadataSync(ctx.paths.terminalMetaFile, terminalManager.getSessionMetadata());
    cancelAllRuntimes();
    void terminalManager.stopServer();
  });
}
