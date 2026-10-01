import { describe, expect, it } from "vitest";
import { DEFAULT_WALLPAPER, getPersistedWallpaper, getWallpaperImageFilter, normalizeWallpaper } from "../wallpaper";

describe("normalizeWallpaper", () => {
  it("returns null for no wallpaper", () => {
    expect(normalizeWallpaper(null)).toBeNull();
    expect(normalizeWallpaper(undefined)).toBeNull();
  });

  it("fills defaults, clamps, and drops retired keys", () => {
    expect(normalizeWallpaper({ path: "/a.png", imgBlur: 99, imgOpacity: -5, opacity: 50, blur: 2, extra: 1 })).toEqual({
      ...DEFAULT_WALLPAPER,
      path: "/a.png",
      imgBlur: 32,
      imgOpacity: 0,
      extra: 1,
    });
    expect(normalizeWallpaper({ path: "/a.png", imgBlur: Number.NaN })?.imgBlur).toBe(DEFAULT_WALLPAPER.imgBlur);
  });
});

describe("getPersistedWallpaper", () => {
  it("keeps only path and image settings", () => {
    expect(getPersistedWallpaper({ path: "/a.png", dataUrl: "data:x", imgBlur: 4, imgOpacity: 80 })).toEqual({
      path: "/a.png",
      imgBlur: 4,
      imgOpacity: 80,
    });
    expect(getPersistedWallpaper({ dataUrl: "data:x" })).toBeNull();
  });
});

describe("getWallpaperImageFilter", () => {
  it("returns a blur filter or none", () => {
    expect(getWallpaperImageFilter({ path: "/a", imgBlur: 5 })).toBe("blur(5px)");
    expect(getWallpaperImageFilter({ path: "/a", imgBlur: 0 })).toBe("none");
    expect(getWallpaperImageFilter(null)).toBe("none");
  });
});
