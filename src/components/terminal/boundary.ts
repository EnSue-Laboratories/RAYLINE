/**
 * Typed views of still-unconverted modules used by the terminal UI. Each
 * cast is the only place their `@ts-nocheck` inference leaks in; drop the
 * casts (and re-export directly) once the owning package lands.
 */
import type { CSSProperties } from "react";
import type { Appearance, ThemeMode, Wallpaper } from "@shared/state/types";
import { useFontScale as untypedUseFontScale } from "../../contexts/FontSizeContext";
import { useTheme as untypedUseTheme } from "../../contexts/ThemeContext";
import {
  applyAppearanceToDocument as untypedApplyAppearanceToDocument,
  applyAppearanceWindowBackground as untypedApplyAppearanceWindowBackground,
  normalizeAppearance as untypedNormalizeAppearance,
} from "../../utils/appearance";
import { getPaneSurfaceStyle as untypedGetPaneSurfaceStyle } from "../../utils/paneSurface";
import {
  getWallpaperImageFilter as untypedGetWallpaperImageFilter,
  normalizeWallpaper as untypedNormalizeWallpaper,
} from "../../utils/wallpaper";

/** Wallpaper as consumed by the terminal surfaces (`normalizeWallpaper` output). */
export type TerminalWallpaper = Partial<Wallpaper> & { dataUrl?: string | null };

// TODO(ts-boundary): drop once data-i18n lands (contexts/FontSizeContext).
export const useFontScale = untypedUseFontScale as () => (px: number) => number;

// TODO(ts-boundary): drop once utils/paneSurface is converted.
export const getPaneSurfaceStyle = untypedGetPaneSurfaceStyle as (hasWallpaper: boolean) => CSSProperties;

// TODO(ts-boundary): drop once utils/wallpaper is converted.
export const getWallpaperImageFilter = untypedGetWallpaperImageFilter as (
  wallpaper: TerminalWallpaper | null | undefined,
) => string;

// ── Terminal window (src/TerminalWindow) ────────────────────────────────────

/** Bridge accepted by `applyAppearanceWindowBackground` (window.api or window.ghApi). */
export interface WindowBackgroundBridge {
  setWindowBackgroundColor?: (color: string) => Promise<unknown>;
}

export interface ThemeContextValue {
  mode: "auto" | ThemeMode;
  resolved: ThemeMode;
  setMode: (mode: "auto" | ThemeMode) => void;
}

// TODO(ts-boundary): drop once data-i18n lands (contexts/ThemeContext).
export const useTheme = untypedUseTheme as () => ThemeContextValue;

// TODO(ts-boundary): drop once data-i18n lands (utils/appearance).
export const normalizeAppearance = untypedNormalizeAppearance as (value?: unknown) => Appearance;
// TODO(ts-boundary): drop once data-i18n lands (utils/appearance).
export const applyAppearanceToDocument = untypedApplyAppearanceToDocument as (
  appearance: Appearance,
  resolvedTheme: ThemeMode,
) => Appearance;
// TODO(ts-boundary): drop once data-i18n lands (utils/appearance).
export const applyAppearanceWindowBackground = untypedApplyAppearanceWindowBackground as (
  appearance: Appearance,
  resolvedTheme: ThemeMode,
  bridge?: WindowBackgroundBridge | null,
) => string;

// TODO(ts-boundary): drop once utils/wallpaper is converted.
export const normalizeWallpaper = untypedNormalizeWallpaper as (wallpaper: unknown) => Wallpaper | null;
