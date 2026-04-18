export const DEFAULT_WALLPAPER = Object.freeze({
  path: null,
  dataUrl: null,
  imgBlur: 3,
  imgOpacity: 100,
});

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function getWallpaperImageOpacity(wallpaper) {
  if (!wallpaper) return DEFAULT_WALLPAPER.imgOpacity;
  if (Number.isFinite(wallpaper.imgOpacity)) {
    return clampNumber(wallpaper.imgOpacity, 0, 100, DEFAULT_WALLPAPER.imgOpacity);
  }
  return DEFAULT_WALLPAPER.imgOpacity;
}

export function normalizeWallpaper(wallpaper) {
  if (!wallpaper) return null;
  const {
    opacity: _opacity,
    blur: _blur,
    imgDarken: _imgDarken,
    imgBrightness: _imgBrightness,
    overlayBrightness: _overlayBrightness,
    overlayDarken: _overlayDarken,
    ...rest
  } = wallpaper;
  return {
    ...DEFAULT_WALLPAPER,
    ...rest,
    imgBlur: clampNumber(wallpaper.imgBlur, 0, 32, DEFAULT_WALLPAPER.imgBlur),
    imgOpacity: getWallpaperImageOpacity(wallpaper),
  };
}

export function getPersistedWallpaper(wallpaper) {
  const normalized = normalizeWallpaper(wallpaper);
  if (!normalized?.path) return null;
  return {
    path: normalized.path,
    imgBlur: normalized.imgBlur,
    imgOpacity: normalized.imgOpacity,
  };
}

export function getWallpaperImageFilter(wallpaper) {
  const normalized = normalizeWallpaper(wallpaper);
  if (!normalized) return "none";

  const filters = [];
  if (normalized.imgBlur > 0) {
    filters.push(`blur(${normalized.imgBlur}px)`);
  }

  return filters.length > 0 ? filters.join(" ") : "none";
}
