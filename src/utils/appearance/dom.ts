/** DOM / native-window side effects of the appearance settings. */

import type { Appearance, ThemeMode } from "@shared/state/types";
import { toThemeMode } from "./constants";
import { buildAppearanceCssVariables } from "./cssVariables";
import { getAppearanceProfile, getAppearanceWindowBackground, normalizeAppearance } from "./normalize";

/** Anything with an inline style we can write CSS variables to (default: `<html>`). */
export interface AppearanceStyleTarget {
  readonly style: Pick<CSSStyleDeclaration, "setProperty" | "getPropertyValue">;
}

/** Preload bridge subset (`window.api` / `window.ghApi`). */
export interface WindowBackgroundBridge {
  setWindowBackgroundColor?: (color: string) => unknown;
}

export interface AppearanceChangeDetail {
  resolved: ThemeMode;
  appearance: Appearance;
}

/**
 * Write the theme's CSS variables to `target` (default `<html>`), touching
 * only properties whose value changed, and fire `rayline:appearance-change`
 * only when something actually changed (listeners re-render Mermaid, xterm, …).
 */
export function applyAppearanceToDocument(
  appearance: unknown,
  resolvedTheme: unknown = "dark",
  target?: AppearanceStyleTarget | null,
): Appearance {
  const normalized = normalizeAppearance(appearance);
  const root = target ?? (typeof document !== "undefined" ? document.documentElement : null);
  if (!root?.style) return normalized;

  const vars = buildAppearanceCssVariables(getAppearanceProfile(normalized, resolvedTheme), resolvedTheme);
  let changed = false;
  for (const [name, value] of Object.entries(vars)) {
    if (root.style.getPropertyValue(name) === value) continue;
    root.style.setProperty(name, value);
    changed = true;
  }
  if (changed && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<AppearanceChangeDetail>("rayline:appearance-change", {
      detail: { resolved: toThemeMode(resolvedTheme), appearance: normalized },
    }));
  }
  return normalized;
}

function getDefaultBridge(): WindowBackgroundBridge | null {
  if (typeof window === "undefined") return null;
  // `api` (main/terminal windows) or `ghApi` (Project Manager); either may be
  // missing outside Electron despite the global typing.
  const candidate: WindowBackgroundBridge | undefined = window.api ?? window.ghApi;
  return candidate ?? null;
}

const lastBridgeColor = new WeakMap<WindowBackgroundBridge, string>();

/**
 * Paint html/body/#root and the native window with the pane color. The IPC
 * call is skipped when the bridge already has this color.
 */
export function applyAppearanceWindowBackground(
  appearance: unknown,
  resolvedTheme: unknown = "dark",
  bridge?: WindowBackgroundBridge | null,
): string {
  const windowBackground = getAppearanceWindowBackground(appearance, resolvedTheme);

  if (typeof document !== "undefined") {
    document.documentElement.style.backgroundColor = windowBackground;
    document.body?.style.setProperty("background-color", windowBackground);
    document.getElementById("root")?.style.setProperty("background-color", windowBackground);
  }

  const windowBridge = bridge || getDefaultBridge();
  if (windowBridge?.setWindowBackgroundColor && lastBridgeColor.get(windowBridge) !== windowBackground) {
    lastBridgeColor.set(windowBridge, windowBackground);
    void windowBridge.setWindowBackgroundColor(windowBackground);
  }
  return windowBackground;
}
