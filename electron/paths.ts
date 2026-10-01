import path from "node:path";
import { app } from "electron";

/**
 * Root of the packaged app (or the repo in dev). `dist/` and `public/` live
 * here; compiled main-process code lives under `dist-electron/`.
 */
export function getAppRoot(): string {
  return app.getAppPath();
}

export function resolveAppPath(...segments: string[]): string {
  return path.join(getAppRoot(), ...segments);
}

export { toUnpackedPath } from "./unpacked-path";
