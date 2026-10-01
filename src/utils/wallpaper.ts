import type { PersistedWallpaper, Wallpaper } from "@shared/state/types";

export type { PersistedWallpaper, Wallpaper } from "@shared/state/types";

/**
 * Anything that may describe a wallpaper: runtime state, the persisted shape,
 * or older persisted objects with retired fields (`opacity`, `blur`,
 * `imgDarken`, …). Unknown extra keys are carried through by
 * `normalizeWallpaper`.
 */
export type WallpaperInput = Partial<Wallpaper> & Readonly<Record<string, unknown>>;

/** A normalized wallpaper plus any extra keys the input carried. */
export type NormalizedWallpaper = Wallpaper & Readonly<Record<string, unknown>>;

export const DEFAULT_WALLPAPER: Readonly<Wallpaper> = Object.freeze({
  path: null,
  dataUrl: null,
  imgBlur: 3,
  imgOpacity: 100,
});

const RETIRED_KEYS: ReadonlySet<string> = new Set([
  "opacity",
  "blur",
  "imgDarken",
  "imgBrightness",
  "overlayBrightness",
  "overlayDarken",
]);

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function getWallpaperImageOpacity(wallpaper: WallpaperInput): number {
  const { imgOpacity } = wallpaper;
  if (typeof imgOpacity === "number" && Number.isFinite(imgOpacity)) {
    return clampNumber(imgOpacity, 0, 100, DEFAULT_WALLPAPER.imgOpacity);
  }
  return DEFAULT_WALLPAPER.imgOpacity;
}

/** Defaults + clamped image settings; retired keys are dropped. Null for no wallpaper. */
export function normalizeWallpaper(wallpaper: WallpaperInput | null | undefined): NormalizedWallpaper | null {
  if (!wallpaper) return null;
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(wallpaper)) {
    if (!RETIRED_KEYS.has(key)) rest[key] = value;
  }
  return {
    ...DEFAULT_WALLPAPER,
    ...rest,
    path: wallpaper.path ?? DEFAULT_WALLPAPER.path,
    dataUrl: wallpaper.dataUrl ?? DEFAULT_WALLPAPER.dataUrl,
    imgBlur: clampNumber(wallpaper.imgBlur, 0, 32, DEFAULT_WALLPAPER.imgBlur),
    imgOpacity: getWallpaperImageOpacity(wallpaper),
  };
}

/** The subset written to disk (never the `dataUrl`); null without a path. */
export function getPersistedWallpaper(wallpaper: WallpaperInput | null | undefined): PersistedWallpaper | null {
  const normalized = normalizeWallpaper(wallpaper);
  if (!normalized?.path) return null;
  return {
    path: normalized.path,
    imgBlur: normalized.imgBlur,
    imgOpacity: normalized.imgOpacity,
  };
}

/** CSS `filter` for the wallpaper image layer. */
export function getWallpaperImageFilter(wallpaper: WallpaperInput | null | undefined): string {
  const normalized = normalizeWallpaper(wallpaper);
  if (!normalized || normalized.imgBlur <= 0) return "none";
  return `blur(${normalized.imgBlur}px)`;
}
