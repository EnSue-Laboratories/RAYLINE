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

/**
 * Files that are executed by an external process (system `node`, shells) or
 * read via plain fs APIs outside Electron must come from app.asar.unpacked.
 * In dev this is a no-op.
 */
export function toUnpackedPath(filePath: string): string {
  return filePath.replace(/app\.asar(?=[\\/])/, "app.asar.unpacked");
}
