import { memo } from "react";
import { useAppSetting } from "../../store/appSettings";
import { getWallpaperImageFilter } from "../../utils/wallpaper";

/** Full-window wallpaper (or the plain pane background). */
export const WallpaperBackground = memo(function WallpaperBackground() {
  const wallpaper = useAppSetting("wallpaper");
  const appBlur = useAppSetting("appBlur");

  if (!wallpaper?.dataUrl) {
    return <div aria-hidden="true" style={{ position: "fixed", inset: 0, zIndex: 0, background: "var(--pane-background)" }} />;
  }
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        filter: appBlur > 0 ? `blur(${appBlur}px)` : "none",
        transition: "filter .2s",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `url(${wallpaper.dataUrl})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          filter: getWallpaperImageFilter({ ...wallpaper }),
          opacity: (wallpaper.imgOpacity / 100).toFixed(3),
          // Scale slightly to hide blur edge artifacts.
          transform: wallpaper.imgBlur || appBlur ? "scale(1.05)" : "none",
        }}
      />
    </div>
  );
});
