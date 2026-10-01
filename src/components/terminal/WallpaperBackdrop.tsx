import { getWallpaperImageFilter } from "../../utils/wallpaper";
import { getTerminalWallpaperOverlayAlpha, getWallpaperOpacityValue, type TerminalWallpaper } from "./theme";

interface WallpaperBackdropProps {
  wallpaper: TerminalWallpaper & { dataUrl: string };
}

/** Wallpaper image + legibility gradient behind the detached terminal window. */
export default function WallpaperBackdrop({ wallpaper }: WallpaperBackdropProps) {
  const overlayAlpha = getTerminalWallpaperOverlayAlpha(wallpaper);
  const top = (overlayAlpha * 100).toFixed(0);
  const bottom = (Math.min(overlayAlpha + 0.12, 0.84) * 100).toFixed(0);
  return (
    <>
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
          backgroundImage: `url(${wallpaper.dataUrl})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          filter: getWallpaperImageFilter(wallpaper),
          opacity: getWallpaperOpacityValue(wallpaper).toFixed(3),
          transform: wallpaper.imgBlur ? "scale(1.04)" : "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 1,
          pointerEvents: "none",
          background: `linear-gradient(180deg, color-mix(in srgb, var(--bg-primary) ${top}%, transparent), color-mix(in srgb, var(--bg-primary) ${bottom}%, transparent))`,
        }}
      />
    </>
  );
}
