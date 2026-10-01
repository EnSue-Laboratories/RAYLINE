import type { CSSProperties } from "react";

/** Inline style that may also set CSS custom properties (`--pane-*`). */
export type PaneStyle = CSSProperties & { readonly [customProperty: `--${string}`]: string };

export type PaneInteractionState = "idle" | "hover" | "active";

export interface PaneInteractionStyle {
  readonly background: string;
  readonly backdropFilter: string;
  readonly boxShadow: string;
}

export interface PaneSurfaceOptions {
  /** Hover fill opacity in % of `--text-primary` (0–100). */
  hoverOpacity?: number;
  /** Active fill opacity in % of `--text-primary` (0–100). */
  activeOpacity?: number;
}

function clampOpacity(value: unknown, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(100, Math.max(0, numeric));
}

function alphaFill(alphaPercent: number): string {
  return `color-mix(in srgb, var(--text-primary) ${alphaPercent.toFixed(3)}%, transparent)`;
}

const INTERACTION_STYLES: Readonly<Record<PaneInteractionState, PaneInteractionStyle>> = {
  idle: {
    background: "transparent",
    backdropFilter: "none",
    boxShadow: "none",
  },
  hover: {
    background: "var(--pane-interaction-hover-fill, var(--pane-interaction-hover, var(--pane-hover)))",
    backdropFilter: "var(--pane-interaction-hover-filter, none)",
    boxShadow: "var(--pane-interaction-hover-shadow, none)",
  },
  active: {
    background: "var(--pane-interaction-active-fill, var(--pane-interaction-active, var(--pane-active)))",
    backdropFilter: "var(--pane-interaction-active-filter, none)",
    boxShadow: "var(--pane-interaction-active-shadow, none)",
  },
};

function isPaneInteractionState(value: unknown): value is PaneInteractionState {
  return value === "idle" || value === "hover" || value === "active";
}

/** Shared (frozen) style for a row/button interaction state; unknown states map to idle. */
export function getPaneInteractionStyle(state: PaneInteractionState | (string & {}) | null | undefined): PaneInteractionStyle {
  return isPaneInteractionState(state) ? INTERACTION_STYLES[state] : INTERACTION_STYLES.idle;
}

/** Imperatively apply an interaction state (hover handlers avoid a React render). */
export function applyPaneInteractionStyle(
  element: HTMLElement,
  state: PaneInteractionState | (string & {}) | null | undefined,
): void {
  const style = getPaneInteractionStyle(state);
  element.style.background = style.background;
  element.style.backdropFilter = style.backdropFilter;
  element.style.boxShadow = style.boxShadow;
}

function buildPaneSurfaceStyle(hasWallpaper: boolean, hoverOpacity: number, activeOpacity: number): PaneStyle {
  const hoverFill = hoverOpacity > 0 ? alphaFill(hoverOpacity) : "var(--pane-hover)";
  const activeFill = alphaFill(activeOpacity);

  if (!hasWallpaper) {
    return {
      background: "var(--pane-background)",
      "--pane-interaction-hover": hoverFill,
      "--pane-interaction-active": activeFill,
      "--pane-interaction-hover-fill": hoverFill,
      "--pane-interaction-active-fill": activeFill,
      "--pane-interaction-hover-filter": "none",
      "--pane-interaction-active-filter": "none",
      "--pane-interaction-hover-shadow": "none",
      "--pane-interaction-active-shadow": "none",
    };
  }

  return {
    background: "var(--pane-background-overlay)",
    "--pane-elevated": "var(--pane-elevated)",
    "--pane-hover": hoverFill,
    "--pane-active": activeFill,
    "--pane-border": "var(--border)",
    "--pane-interaction-hover": hoverFill,
    "--pane-interaction-active": activeFill,
    "--pane-interaction-hover-fill": hoverFill,
    "--pane-interaction-active-fill": activeFill,
    "--pane-interaction-hover-filter": "none",
    "--pane-interaction-active-filter": "none",
    "--pane-interaction-hover-shadow": "inset 0 0 0 1px var(--border)",
    "--pane-interaction-active-shadow": "none",
  };
}

const SURFACE_CACHE_LIMIT = 64;
const surfaceCache = new Map<string, PaneStyle>();

/**
 * Pane background + interaction custom properties. Results are cached and
 * frozen per (wallpaper, hover, active), so the same inputs return the same
 * object on every render — spread it, don't mutate it.
 */
export function getPaneSurfaceStyle(hasWallpaper: boolean, options: PaneSurfaceOptions = {}): PaneStyle {
  const hoverOpacity = clampOpacity(options.hoverOpacity, hasWallpaper ? 2 : 0);
  const activeOpacity = clampOpacity(options.activeOpacity, hasWallpaper ? 3.5 : 8);
  const key = `${hasWallpaper ? 1 : 0}|${hoverOpacity}|${activeOpacity}`;
  let style = surfaceCache.get(key);
  if (!style) {
    style = Object.freeze(buildPaneSurfaceStyle(hasWallpaper, hoverOpacity, activeOpacity));
    // Slider-driven opacities can produce many keys; keep the cache bounded.
    if (surfaceCache.size >= SURFACE_CACHE_LIMIT) surfaceCache.clear();
    surfaceCache.set(key, style);
  }
  return style;
}
