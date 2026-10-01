/** Shared BrowserWindow options and helpers for every RayLine window. */

import { BrowserWindow, shell, type BrowserWindowConstructorOptions, type Rectangle } from "electron";
import { resolveAppPath } from "../paths";
import type { AppContext, AppEnv } from "./context";

export const WINDOW_BACKGROUND = "#0D0D10";

export function getWindowChromeOptions(env: AppEnv): BrowserWindowConstructorOptions {
  if (env.isMac) {
    return { titleBarStyle: "hiddenInset", trafficLightPosition: { x: 16, y: 18 } };
  }
  if (env.isWindows) {
    // Keep Windows fully in the client area so our custom controls receive
    // actual pointer events instead of sitting inside the OS title bar.
    return { frame: false, autoHideMenuBar: true };
  }
  return {};
}

export interface WindowSpec {
  title: string;
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
  preload: string;
}

/** Creates a hidden window with RayLine chrome; external links open in the system browser. */
export function createChromeWindow(ctx: AppContext, spec: WindowSpec): BrowserWindow {
  const win = new BrowserWindow({
    title: spec.title,
    width: spec.width,
    height: spec.height,
    minWidth: spec.minWidth,
    minHeight: spec.minHeight,
    show: false,
    backgroundColor: WINDOW_BACKGROUND,
    icon: resolveAppPath("public", "icon.png"),
    ...getWindowChromeOptions(ctx.env),
    webPreferences: {
      preload: spec.preload,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  if (ctx.env.isWindows) win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
  return win;
}

/** Loads a renderer page: the Vite dev server in dev, `dist/` when packaged. */
export function loadRendererPage(ctx: AppContext, win: BrowserWindow, page: "index.html" | "src/project-manager.html" | "src/terminal-window.html"): void {
  const load = ctx.env.isDev
    ? win.loadURL(`http://localhost:${ctx.env.devServerPort}${page === "index.html" ? "" : `/${page}`}`)
    : win.loadFile(resolveAppPath("dist", ...page.split("/")));
  load.catch((error: unknown) => console.error(`[window] failed to load ${page}:`, error));
}

/** Shows the window on ready-to-show, after first load, or after 2.5 s — whichever comes first. */
export function showWindowWhenReady(win: BrowserWindow): void {
  let shown = false;
  const show = (): void => {
    if (shown || win.isDestroyed()) return;
    shown = true;
    win.show();
  };
  win.once("ready-to-show", show);
  win.webContents.once("did-finish-load", () => setTimeout(show, 0));
  setTimeout(show, 2500);
}

export interface WindowDescription {
  bounds: Rectangle;
  contentSize: { width: number; height: number };
  focused: boolean;
  visible: boolean;
  minimized: boolean;
}

export function describeWindow(win: BrowserWindow | null | undefined): WindowDescription | null {
  if (!win || win.isDestroyed()) return null;
  const [width = 0, height = 0] = win.getContentSize();
  return {
    bounds: win.getBounds(),
    contentSize: { width, height },
    focused: win.isFocused(),
    visible: win.isVisible(),
    minimized: win.isMinimized(),
  };
}

export function isOpen(win: BrowserWindow | null | undefined): win is BrowserWindow {
  return Boolean(win && !win.isDestroyed());
}

export function focusWindow(win: BrowserWindow): void {
  if (win.isMinimized()) win.restore();
  if (!win.isVisible()) win.show();
  win.focus();
}
