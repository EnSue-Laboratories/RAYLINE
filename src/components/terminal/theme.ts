import type { ITheme, Terminal } from "@xterm/xterm";
import type { Wallpaper } from "@shared/state/types";

export type TerminalThemeMode = "light" | "dark";

/** Wallpaper as passed to the terminal surfaces (`normalizeWallpaper` output). */
export type TerminalWallpaper = Partial<Wallpaper>;

export const DEFAULT_FONT_FAMILY = "'JetBrains Mono','Fira Code',monospace";
export const FONT_FAMILY = "var(--font-mono)";
const XTERM_TRANSPARENT = "rgba(0,0,0,0)";
const TERMINAL_OPAQUE_BG = "#0D0D10";

export function getWallpaperOpacityValue(wallpaper: TerminalWallpaper | null | undefined): number {
  const opacity = wallpaper?.imgOpacity;
  if (typeof opacity !== "number" || !Number.isFinite(opacity)) return 1;
  return Math.min(1, Math.max(0, opacity / 100));
}

export function getTerminalWallpaperOverlayAlpha(wallpaper: TerminalWallpaper | null | undefined): number {
  return 0.52 + getWallpaperOpacityValue(wallpaper) * 0.18;
}

/** Payload of the `rayline:theme-change` / `rayline:appearance-change` events. */
export interface ThemeChangeDetail {
  resolved?: unknown;
  mode?: unknown;
  theme?: unknown;
}

export function getResolvedThemeMode(detail?: ThemeChangeDetail | null): TerminalThemeMode {
  const candidate = detail?.resolved || detail?.mode || detail?.theme;
  if (candidate === "light" || candidate === "dark") return candidate;

  if (typeof document !== "undefined") {
    const root = document.documentElement;
    if (root.dataset.theme === "light" || root.dataset.theme === "dark") return root.dataset.theme;
    if (root.classList.contains("light")) return "light";
  }

  return "dark";
}

export function readRootCssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

export function getTerminalTheme(opaqueBackground: boolean, mode: TerminalThemeMode = "dark"): ITheme {
  const light = mode === "light";
  const background = light ? "#f8fafc" : TERMINAL_OPAQUE_BG;
  const foreground = light ? "rgba(15,23,42,0.88)" : "rgba(244,247,250,0.88)";
  const cursor = light ? "rgba(15,23,42,0.96)" : "rgba(245,247,251,0.98)";
  const selectionBackground = light ? "rgba(37,99,235,0.18)" : "rgba(120,182,255,0.18)";
  const selectionInactiveBackground = light ? "rgba(37,99,235,0.1)" : "rgba(120,182,255,0.1)";
  const opaque = opaqueBackground ? readRootCssVar("--term-background", background) : XTERM_TRANSPARENT;

  return {
    background: opaque,
    foreground: readRootCssVar("--term-foreground", foreground),
    cursor: readRootCssVar("--term-cursor", cursor),
    cursorAccent: opaque,
    selectionBackground: readRootCssVar("--term-selection-background", selectionBackground),
    selectionInactiveBackground: readRootCssVar("--term-selection-inactive-background", selectionInactiveBackground),
    black: readRootCssVar("--term-black", "#0f1116"),
    red: readRootCssVar("--term-red", "#f38ba8"),
    green: readRootCssVar("--term-green", "#7ed7b9"),
    yellow: readRootCssVar("--term-yellow", "#f5c97a"),
    blue: readRootCssVar("--term-blue", "#89b4fa"),
    magenta: readRootCssVar("--term-magenta", "#cba6f7"),
    cyan: readRootCssVar("--term-cyan", "#74c7ec"),
    white: readRootCssVar("--term-white", "#bac2de"),
    brightBlack: readRootCssVar("--term-bright-black", "#585b70"),
    brightRed: readRootCssVar("--term-bright-red", "#f7a6bc"),
    brightGreen: readRootCssVar("--term-bright-green", "#9ce8cf"),
    brightYellow: readRootCssVar("--term-bright-yellow", "#f8d99c"),
    brightBlue: readRootCssVar("--term-bright-blue", "#a6c9ff"),
    brightMagenta: readRootCssVar("--term-bright-magenta", "#d9b8fb"),
    brightCyan: readRootCssVar("--term-bright-cyan", "#98dbf3"),
    brightWhite: readRootCssVar("--term-bright-white", "#f5f7fb"),
  };
}

export function getTerminalHostBackground(opaqueBackground: boolean): string {
  return opaqueBackground ? "var(--term-background)" : "transparent";
}

export function applyTerminalVisualState(
  term: Terminal | null,
  hostEl: HTMLElement | null,
  containerEl: HTMLElement | null,
  opaqueBackground: boolean,
  mode: TerminalThemeMode,
): void {
  const hostBackground = getTerminalHostBackground(opaqueBackground);
  if (hostEl) {
    hostEl.classList.toggle("rayline-terminal-host--opaque", opaqueBackground);
    hostEl.style.background = hostBackground;
  }
  if (containerEl) containerEl.style.background = hostBackground;
  if (!term) return;

  try {
    term.options.theme = getTerminalTheme(opaqueBackground, mode);
    term.options.fontFamily = readRootCssVar("--font-mono", DEFAULT_FONT_FAMILY);
    term.options.allowTransparency = true;
    term.refresh(0, Math.max(0, term.rows - 1));
  } catch {
    // xterm option updates can fail during teardown; the next mount will apply them.
  }
}
