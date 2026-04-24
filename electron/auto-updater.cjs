/**
 * auto-updater.cjs
 *
 * Wraps electron-updater and bridges status events to the renderer via IPC.
 * In dev mode (app not packaged) the real update check is skipped; the UI
 * receives a "not-available" status immediately so it doesn't crash.
 *
 * Status payload shape:
 *   { phase: "idle"|"checking"|"available"|"not-available"|"downloading"|"ready"|"error",
 *     version?: string, percent?: number, error?: string }
 */

const { app } = require("electron");
const { autoUpdater } = require("electron-updater");

const isDev = !app.isPackaged;
const isWindows = process.platform === "win32";

let _win = null;

function send(payload) {
  try {
    if (_win && !_win.isDestroyed()) {
      _win.webContents.send("updater-status", payload);
    }
  } catch {}
}

function initAutoUpdater(mainWindow) {
  _win = mainWindow;

  if (isDev || !isWindows) {
    // The Windows release channel is the only updater-backed channel for now.
    return;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on("checking-for-update", () => {
    send({ phase: "checking" });
  });

  autoUpdater.on("update-available", (info) => {
    send({ phase: "available", version: info.version });
  });

  autoUpdater.on("update-not-available", () => {
    send({ phase: "not-available" });
  });

  autoUpdater.on("download-progress", (progress) => {
    send({ phase: "downloading", percent: Math.round(progress.percent) });
  });

  autoUpdater.on("update-downloaded", (info) => {
    send({ phase: "ready", version: info.version });
  });

  autoUpdater.on("error", (err) => {
    const msg = err?.message || String(err);
    send({ phase: "error", error: msg });
    console.error("[auto-updater] error:", msg);
  });
}

async function handleCheckForUpdates() {
  if (isDev || !isWindows) {
    // Simulate a quick check in dev so the UI doesn't hang.
    setTimeout(() => send({ phase: "not-available" }), 400);
    return;
  }
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    send({ phase: "error", error: err?.message || String(err) });
  }
}

async function handleDownloadUpdate() {
  if (isDev || !isWindows) return;
  try {
    await autoUpdater.downloadUpdate();
  } catch (err) {
    send({ phase: "error", error: err?.message || String(err) });
  }
}

function handleInstallUpdate() {
  if (isDev || !isWindows) return;
  autoUpdater.quitAndInstall(false, true);
}

module.exports = {
  initAutoUpdater,
  handleCheckForUpdates,
  handleDownloadUpdate,
  handleInstallUpdate,
};
