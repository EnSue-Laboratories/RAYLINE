/**
 * Wallpaper images (copied into userData/wallpapers) and generic image reads
 * for the renderer (`read-image`).
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const WALLPAPER_EXTENSIONS: readonly string[] = ["png", "jpg", "jpeg", "webp", "gif", "bmp", "avif"];

export const IMAGE_MIME_TYPES: Readonly<Record<string, string>> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
  avif: "image/avif",
};

export function isManagedWallpaperPath(storageDir: string, filePath: string | null | undefined): filePath is string {
  if (!filePath) return false;
  const relative = path.relative(storageDir, path.resolve(filePath));
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

/** Deletes a wallpaper copy we own; paths outside the storage dir are ignored. */
export async function removeManagedWallpaper(storageDir: string, filePath: string | null | undefined): Promise<void> {
  if (!isManagedWallpaperPath(storageDir, filePath)) return;
  await fs.promises.unlink(filePath).catch(() => undefined);
}

export function wallpaperFileName(sourcePath: string, now = Date.now()): string {
  const ext = path.extname(sourcePath).toLowerCase();
  const baseName = path.basename(sourcePath, ext)
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "wallpaper";
  return `${now}-${baseName}${ext || ".png"}`;
}

/** Copies the picked image into the managed storage dir and drops the previous managed copy. */
export async function importWallpaper(
  storageDir: string,
  sourcePath: string,
  previousPath: string | null | undefined,
): Promise<string> {
  await fs.promises.mkdir(storageDir, { recursive: true });
  const storedPath = path.join(storageDir, wallpaperFileName(sourcePath));
  await fs.promises.copyFile(sourcePath, storedPath);
  if (previousPath && previousPath !== storedPath) {
    await removeManagedWallpaper(storageDir, previousPath);
  }
  return storedPath;
}

export function expandHomePath(filePath: string): string {
  if (filePath === "~" || filePath.startsWith("~/")) return path.join(os.homedir(), filePath.slice(1));
  return filePath;
}

/** Reads an image file as a data URL; null on any failure. */
export async function readImageAsDataUrl(filePath: unknown): Promise<string | null> {
  if (typeof filePath !== "string" || !filePath) return null;
  try {
    const resolved = expandHomePath(filePath);
    const data = await fs.promises.readFile(resolved);
    const ext = path.extname(resolved).toLowerCase().replace(".", "");
    const mime = IMAGE_MIME_TYPES[ext] ?? "image/png";
    return `data:${mime};base64,${data.toString("base64")}`;
  } catch {
    return null;
  }
}
