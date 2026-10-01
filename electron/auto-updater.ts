/**
 * Wraps electron-updater and bridges status events to the renderer via the
 * `updater-status` channel. Only the packaged Windows build is updater-backed;
 * elsewhere a check reports "not-available" so the UI never hangs.
 */

import { app, type BrowserWindow } from "electron";
import type { AppUpdater } from "electron-updater";
import type { UpdaterStatus } from "@shared/updater/types";
import { sendToWindow } from "./ipc/typed";

const isDev = !app.isPackaged;
const isWindows = process.platform === "win32";
const updaterEnabled = !isDev && isWindows;

let statusWindow: BrowserWindow | null = null;
let autoUpdaterPromise: Promise<AppUpdater | null> | null = null;
let autoUpdaterLoadError: string | null = null;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function send(payload: UpdaterStatus): void {
  try {
    sendToWindow(statusWindow, "updater-status", payload);
  } catch {
    // window torn down mid-send
  }
}

function getAutoUpdater(): Promise<AppUpdater | null> {
  autoUpdaterPromise ??= import("electron-updater").then(
    (mod) => mod.autoUpdater,
    (err: unknown) => {
      autoUpdaterLoadError = errorMessage(err);
      return null;
    },
  );
  return autoUpdaterPromise;
}

function sendAutoUpdaterUnavailable(): void {
  const msg = autoUpdaterLoadError || "electron-updater is unavailable";
  send({ phase: "error", error: msg });
  console.error("[auto-updater] unavailable:", msg);
}

function wireEvents(autoUpdater: AppUpdater): void {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.on("checking-for-update", () => send({ phase: "checking" }));
  autoUpdater.on("update-available", (info) => send({ phase: "available", version: info.version }));
  autoUpdater.on("update-not-available", () => send({ phase: "not-available" }));
  autoUpdater.on("download-progress", (progress) => send({ phase: "downloading", percent: Math.round(progress.percent) }));
  autoUpdater.on("update-downloaded", (info) => send({ phase: "ready", version: info.version }));
  autoUpdater.on("error", (err) => {
    const msg = errorMessage(err);
    send({ phase: "error", error: msg });
    console.error("[auto-updater] error:", msg);
  });
}

export function initAutoUpdater(mainWindow: BrowserWindow): void {
  statusWindow = mainWindow;
  // The Windows release channel is the only updater-backed channel for now.
  if (!updaterEnabled) return;

  void getAutoUpdater().then((autoUpdater) => {
    if (!autoUpdater) {
      sendAutoUpdaterUnavailable();
      return;
    }
    wireEvents(autoUpdater);
  });
}

export async function handleCheckForUpdates(): Promise<void> {
  if (!updaterEnabled) {
    // Simulate a quick check in dev so the UI doesn't hang.
    setTimeout(() => send({ phase: "not-available" }), 400);
    return;
  }
  const autoUpdater = await getAutoUpdater();
  if (!autoUpdater) {
    sendAutoUpdaterUnavailable();
    return;
  }
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    send({ phase: "error", error: errorMessage(err) });
  }
}

export async function handleDownloadUpdate(): Promise<void> {
  if (!updaterEnabled) return;
  const autoUpdater = await getAutoUpdater();
  if (!autoUpdater) {
    sendAutoUpdaterUnavailable();
    return;
  }
  try {
    await autoUpdater.downloadUpdate();
  } catch (err) {
    send({ phase: "error", error: errorMessage(err) });
  }
}

export async function handleInstallUpdate(): Promise<void> {
  if (!updaterEnabled) return;
  const autoUpdater = await getAutoUpdater();
  if (!autoUpdater) {
    sendAutoUpdaterUnavailable();
    return;
  }
  autoUpdater.quitAndInstall(false, true);
}
