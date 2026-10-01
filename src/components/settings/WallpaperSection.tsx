import { memo, useEffect, useState } from "react";
import { Image } from "lucide-react";
import type { Wallpaper } from "@shared/state/types";
import { useStableCallback } from "../../hooks/useStableCallback";
import { RangeSetting, SettingHeader } from "./controls";
import { DEFAULT_WALLPAPER, normalizeWallpaper, type FontScale, type Translator } from "./deps";
import { wallpaperPathHint } from "./helpers";
import { getSettingsStyles, sliderPct } from "./styles";

interface WallpaperSectionProps {
  s: FontScale;
  t: Translator;
  wallpaper: Wallpaper | null | undefined;
  onWallpaperChange: (next: Wallpaper | null) => void;
}

function toLocal(wallpaper: Wallpaper | null | undefined): Wallpaper {
  return (wallpaper ? normalizeWallpaper({ ...wallpaper }) : null) ?? { ...DEFAULT_WALLPAPER };
}

/** Wallpaper picker plus image blur / opacity. Slider drags only re-render this section. */
export const WallpaperSection = memo(function WallpaperSection({ s, t, wallpaper, onWallpaperChange }: WallpaperSectionProps) {
  const styles = getSettingsStyles(s);
  const [local, setLocal] = useState<Wallpaper>(() => toLocal(wallpaper));
  const [syncedWallpaper, setSyncedWallpaper] = useState(wallpaper);
  const [chooseHover, setChooseHover] = useState(false);

  // Local edits reset when the persisted wallpaper changes outside this panel.
  if (wallpaper !== syncedWallpaper) {
    setSyncedWallpaper(wallpaper);
    if (wallpaper !== local) setLocal(toLocal(wallpaper));
  }

  const update = useStableCallback((patch: Partial<Wallpaper>) => {
    const next = toLocal({ ...local, ...patch });
    setLocal(next);
    onWallpaperChange(next.path ? next : null);
  });

  // The data URL is not persisted: reload it when only the path is known (e.g. after restart).
  useEffect(() => {
    const path = local.path;
    if (!path || local.dataUrl || !window.api?.readImage) return undefined;
    let cancelled = false;
    void window.api.readImage(path).then((dataUrl) => {
      if (!cancelled && dataUrl) update({ dataUrl });
    });
    return () => {
      cancelled = true;
    };
  }, [local.path, local.dataUrl, update]);

  const handleChooseImage = async () => {
    const filePath = await window.api.selectWallpaper(local.path);
    if (!filePath) return;
    const dataUrl = await window.api.readImage(filePath);
    update({ path: filePath, dataUrl });
  };

  const handleRemove = async () => {
    const previousPath = local.path;
    setLocal({ ...DEFAULT_WALLPAPER });
    onWallpaperChange(null);
    if (previousPath && window.api?.deleteWallpaper) await window.api.deleteWallpaper(previousPath);
  };

  const handleBlur = useStableCallback((value: number) => update({ imgBlur: value }));
  const handleOpacity = useStableCallback((value: number) => update({ imgOpacity: value }));
  const pathHint = wallpaperPathHint(local.path);
  const imgBlur = local.imgBlur || 0;
  const imgOpacity = local.imgOpacity || 0;

  return (
    <>
      <div style={{ marginBottom: 28 }}>
        <SettingHeader s={s} title={t("settings.wallpaper")} description={t("settings.wallpaperDescription")} spacing={12} />
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
          <div
            style={{
              width: 120,
              height: 72,
              borderRadius: 8,
              border: "1px solid var(--control-border)",
              background: local.dataUrl ? `url("${local.dataUrl}") center/cover no-repeat` : "var(--control-bg)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              overflow: "hidden",
            }}
          >
            {!local.path && <Image size={24} strokeWidth={1.2} color="color-mix(in srgb, var(--text-primary) 13%, transparent)" />}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={handleChooseImage}
              onMouseEnter={() => setChooseHover(true)}
              onMouseLeave={() => setChooseHover(false)}
              style={{
                ...styles.button,
                background: chooseHover ? "color-mix(in srgb, var(--control-bg), var(--text-primary) 7%)" : "var(--control-bg)",
              }}
            >
              {t("settings.chooseImage")}
            </button>
            {local.path && (
              <button
                type="button"
                onClick={handleRemove}
                style={{ ...styles.button, color: "color-mix(in srgb, var(--text-primary) 49%, transparent)" }}
              >
                {t("settings.remove")}
              </button>
            )}
          </div>
        </div>
        {pathHint && (
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: s(10),
              color: "color-mix(in srgb, var(--text-primary) 16%, transparent)",
              marginTop: 4,
              marginLeft: 2,
            }}
          >
            {pathHint}
          </div>
        )}
      </div>

      <RangeSetting
        s={s}
        label={t("settings.imageBlurValue", { value: imgBlur })}
        value={imgBlur}
        min={0}
        max={32}
        pct={sliderPct(imgBlur, 0, 32)}
        onValueChange={handleBlur}
      />
      <RangeSetting
        s={s}
        label={t("settings.imageOpacityValue", { value: imgOpacity })}
        value={imgOpacity}
        min={0}
        max={100}
        pct={sliderPct(imgOpacity, 0, 100)}
        onValueChange={handleOpacity}
        description={t("settings.imageOpacityDescription")}
      />
    </>
  );
});
