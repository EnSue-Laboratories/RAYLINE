/** App version / build info and the auto-updater. */

import fs from "node:fs";
import { app } from "electron";
import type { AppBuildInfo } from "@shared/updater/types";
import { handleCheckForUpdates, handleDownloadUpdate, handleInstallUpdate } from "../auto-updater";
import { resolveAppPath } from "../paths";
import { handle } from "./typed";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

let buildInfo: Promise<AppBuildInfo> | null = null;

/** `raylineBuild` metadata electron-builder writes into the packaged package.json (absent in dev). */
async function readAppBuild(): Promise<AppBuildInfo> {
  const info: AppBuildInfo = { version: app.getVersion(), packaged: app.isPackaged };
  try {
    const pkg: unknown = JSON.parse(await fs.promises.readFile(resolveAppPath("package.json"), "utf-8"));
    const meta = isRecord(pkg) && isRecord(pkg.raylineBuild) ? pkg.raylineBuild : {};
    if (typeof meta.commit === "string" && meta.commit) info.commit = meta.commit;
    if (typeof meta.repository === "string" && meta.repository) info.repository = meta.repository;
  } catch {
    // no package.json metadata
  }
  return info;
}

export function registerUpdaterIpc(): void {
  handle("get-app-version", () => app.getVersion());
  handle("get-app-build", () => (buildInfo ??= readAppBuild()));
  handle("updater-check", () => handleCheckForUpdates());
  handle("updater-download", () => handleDownloadUpdate());
  handle("updater-install", () => handleInstallUpdate());
}
