/** Dialogs, file paths, wallpapers and message images. */

import fs from "node:fs";
import { BrowserWindow, dialog, shell, type IpcMainInvokeEvent, type OpenDialogOptions } from "electron";
import type { AppContext } from "../app/context";
import { storeImageDataUrl, toStoredImage } from "../services/message-images";
import { importWallpaper, readImageAsDataUrl, removeManagedWallpaper, WALLPAPER_EXTENSIONS } from "../services/wallpaper";
import { handle } from "./typed";

function showOpenDialog(ctx: AppContext, event: IpcMainInvokeEvent, options: OpenDialogOptions) {
  // Parent the dialog to the main window as before; fall back to the sender's window.
  const parent = ctx.windows.main ?? BrowserWindow.fromWebContents(event.sender);
  return parent && !parent.isDestroyed() ? dialog.showOpenDialog(parent, options) : dialog.showOpenDialog(options);
}

export function registerFileIpc(ctx: AppContext): void {
  handle("folder-pick", async (event) => {
    const result = await showOpenDialog(ctx, event, { properties: ["openDirectory"] });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  handle("select-files", async (event) => {
    const result = await showOpenDialog(ctx, event, { properties: ["openFile", "multiSelections"] });
    return result.canceled ? [] : result.filePaths;
  });

  handle("open-path", (_event, dirPath) => shell.openPath(dirPath));

  handle("path-exists", async (_event, filePath) => {
    if (!filePath || typeof filePath !== "string") return false;
    try {
      await fs.promises.access(filePath);
      return true;
    } catch {
      return false;
    }
  });

  handle("get-drafts-path", async () => {
    await fs.promises.mkdir(ctx.paths.draftsDir, { recursive: true });
    return ctx.paths.draftsDir;
  });

  handle("select-wallpaper", async (event, previousPath) => {
    const result = await showOpenDialog(ctx, event, {
      properties: ["openFile"],
      filters: [{ name: "Images", extensions: [...WALLPAPER_EXTENSIONS] }],
    });
    const source = result.filePaths[0];
    if (result.canceled || !source) return null;
    try {
      return await importWallpaper(ctx.paths.wallpapersDir, source, previousPath);
    } catch (error) {
      console.error("Failed to import wallpaper:", error);
      return null;
    }
  });

  handle("delete-wallpaper", async (_event, filePath) => {
    try {
      await removeManagedWallpaper(ctx.paths.wallpapersDir, filePath);
      return true;
    } catch (error) {
      console.error("Failed to delete wallpaper:", error);
      return false;
    }
  });

  handle("read-image", (_event, filePath) => readImageAsDataUrl(filePath));

  handle("store-message-image", async (_event, input) => {
    try {
      const file = await storeImageDataUrl(ctx.paths.messageImagesDir, input?.dataUrl);
      return file ? toStoredImage(file, input) : null;
    } catch (error) {
      console.error("Failed to store message image:", error);
      return null;
    }
  });
}
