/** Window controls (act on the sender's window) and clipboard. */

import { BrowserWindow, clipboard, nativeImage, type IpcMainInvokeEvent } from "electron";
import type { AppContext } from "../app/context";
import { createProjectManagerWindow } from "../app/windows";
import { handle, on } from "./typed";

function eventWindow(ctx: AppContext, event: IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender) ?? ctx.windows.main ?? ctx.windows.pm ?? null;
}

export function registerWindowIpc(ctx: AppContext): void {
  on("open-project-manager", () => createProjectManagerWindow(ctx));

  handle("window-close-current", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return false;
    win.close();
    return true;
  });

  handle("set-window-opacity", (event, opacity) => {
    const win = eventWindow(ctx, event);
    const value = Number(opacity);
    if (!win || !Number.isFinite(value)) return false;
    win.setOpacity(Math.max(0.2, Math.min(1, value)));
    return true;
  });

  handle("set-window-background-color", (event, color) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? ctx.windows.main;
    if (!win || typeof color !== "string") return false;
    const normalized = color.trim();
    if (!/^#[0-9a-fA-F]{6}$/.test(normalized)) return false;
    win.setBackgroundColor(normalized);
    return true;
  });

  handle("window-minimize", (event) => {
    const win = eventWindow(ctx, event);
    if (!win) return false;
    win.minimize();
    return true;
  });

  handle("window-toggle-maximize", (event) => {
    const win = eventWindow(ctx, event);
    if (!win) return false;
    if (win.isMaximized()) {
      win.unmaximize();
      return false;
    }
    win.maximize();
    return true;
  });

  handle("window-close", (event) => {
    const win = eventWindow(ctx, event);
    if (!win) return false;
    win.close();
    return true;
  });

  handle("clipboard-write-image", (_event, dataUrl) => {
    if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) return false;
    try {
      const image = nativeImage.createFromDataURL(dataUrl);
      if (image.isEmpty()) return false;
      clipboard.writeImage(image);
      return true;
    } catch (error) {
      console.error("[clipboard-write-image] Failed to write image", error);
      return false;
    }
  });

  handle("clipboard-write-text", (_event, text) => {
    clipboard.writeText(text);
    return true as const;
  });

  handle("clipboard-read-text", () => clipboard.readText());
}
