import { useState, useCallback, useEffect } from "react";
import { ArrowLeft, Image } from "lucide-react";
import { useFontScale } from "../contexts/FontSizeContext";
import { getPaneSurfaceStyle } from "../utils/paneSurface";
import { DEFAULT_WALLPAPER, normalizeWallpaper } from "../utils/wallpaper";

export default function Settings({ wallpaper, onWallpaperChange, fontSize, onFontSizeChange, defaultPrBranch, onDefaultPrBranchChange, onClose }) {
  const s = useFontScale();
  const [local, setLocal] = useState(() => normalizeWallpaper(wallpaper) ?? { ...DEFAULT_WALLPAPER });

  // Sync from parent when wallpaper prop changes externally
  useEffect(() => {
    // Local edits should reset when the persisted wallpaper changes outside this panel.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocal(normalizeWallpaper(wallpaper) ?? { ...DEFAULT_WALLPAPER });
  }, [wallpaper]);

  // Load data URL when path is set but dataUrl is missing (e.g. after app restart)
  useEffect(() => {
    if (local.path && !local.dataUrl && window.api?.readImage) {
      window.api.readImage(local.path).then((dataUrl) => {
        if (dataUrl) {
          setLocal((prev) => {
            const next = normalizeWallpaper({ ...prev, dataUrl });
            onWallpaperChange(next.path ? next : null);
            return next;
          });
        }
      });
    }
  }, [local.path]); // eslint-disable-line react-hooks/exhaustive-deps

  const propagate = useCallback(
    (next) => {
      onWallpaperChange(next.path ? next : null);
    },
    [onWallpaperChange]
  );

  const update = useCallback(
    (patch) => {
      setLocal((prev) => {
        const next = normalizeWallpaper({ ...prev, ...patch });
        propagate(next);
        return next;
      });
    },
    [propagate]
  );

  const handleChooseImage = async () => {
    const filePath = await window.api.selectWallpaper(local.path);
    if (!filePath) return;
    const dataUrl = await window.api.readImage(filePath);
    update({ path: filePath, dataUrl });
  };

  const handleRemove = async () => {
    const previousPath = local.path;
    const next = { ...DEFAULT_WALLPAPER };
    setLocal(next);
    onWallpaperChange(null);
    if (previousPath && window.api?.deleteWallpaper) {
      await window.api.deleteWallpaper(previousPath);
    }
  };

  const pathHint =
    local.path
      ? local.path.split(/[/\\]/).slice(-2).join("/")
      : null;

  const sliderPct = (value, min, max) => ((value - min) / (max - min)) * 100;
  const imgBlurPct = sliderPct(local.imgBlur || 0, 0, 32);
  const imgOpacityPct = sliderPct(local.imgOpacity || 0, 0, 100);

  // Slider track style helper
  const sliderTrack = (pct) =>
    `linear-gradient(to right, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.5) ${pct}%, rgba(255,255,255,0.08) ${pct}%, rgba(255,255,255,0.08) 100%)`;

  const sliderStyle = (pct) => ({
    width: "100%",
    height: 4,
    WebkitAppearance: "none",
    appearance: "none",
    borderRadius: 2,
    background: sliderTrack(pct),
    outline: "none",
    cursor: "pointer",
    accentColor: "white",
  });

  // Hover state refs for buttons
  const [backHover, setBackHover] = useState(false);
  const [chooseHover, setChooseHover] = useState(false);
  const [removeHover, setRemoveHover] = useState(false);

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        position: "relative",
        zIndex: 10,
        ...getPaneSurfaceStyle(Boolean(local.dataUrl)),
        color: "rgba(255,255,255,0.85)",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {/* Drag region */}
      <div style={{ height: 52, WebkitAppRegion: "drag", flexShrink: 0 }} />

      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "0 24px 20px",
          WebkitAppRegion: "no-drag",
          flexShrink: 0,
        }}
      >
        <button
          onClick={onClose}
          onMouseEnter={() => setBackHover(true)}
          onMouseLeave={() => setBackHover(false)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 28,
            height: 28,
            borderRadius: 7,
            background: backHover
              ? "rgba(255,255,255,0.05)"
              : "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.04)",
            color: backHover
              ? "rgba(255,255,255,0.75)"
              : "rgba(255,255,255,0.5)",
            cursor: "pointer",
            transition: "all .2s",
          }}
        >
          <ArrowLeft size={14} strokeWidth={1.5} />
        </button>
        <span
          style={{
            fontSize: s(14),
            fontWeight: 600,
            color: "rgba(255,255,255,0.85)",
          }}
        >
          Settings
        </span>
      </div>

      {/* Scrollable content */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          display: "flex",
          justifyContent: "center",
          padding: "0 24px 40px",
        }}
      >
        <div style={{ width: "100%", maxWidth: 520 }}>
          {/* APPEARANCE section label */}
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: s(10),
              fontWeight: 600,
              color: "rgba(255,255,255,0.25)",
              letterSpacing: ".12em",
              textTransform: "uppercase",
              marginBottom: 20,
            }}
          >
            APPEARANCE
          </div>

          {/* Wallpaper subsection */}
          <div style={{ marginBottom: 28 }}>
            <div
              style={{
                fontSize: s(13),
                color: "rgba(255,255,255,0.8)",
                marginBottom: 2,
              }}
            >
              Wallpaper
            </div>
            <div
              style={{
                fontSize: s(11),
                color: "rgba(255,255,255,0.3)",
                marginBottom: 12,
              }}
            >
              Set a custom background image
            </div>

            {/* Preview row */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                marginBottom: 6,
              }}
            >
              {/* Thumbnail */}
              <div
                style={{
                  width: 120,
                  height: 72,
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: local.dataUrl
                    ? `url("${local.dataUrl}") center/cover no-repeat`
                    : "rgba(255,255,255,0.03)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  overflow: "hidden",
                }}
              >
                {!local.path && (
                  <Image
                    size={24}
                    strokeWidth={1.2}
                    color="rgba(255,255,255,0.12)"
                  />
                )}
              </div>

              {/* Buttons */}
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={handleChooseImage}
                  onMouseEnter={() => setChooseHover(true)}
                  onMouseLeave={() => setChooseHover(false)}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 7,
                    background: chooseHover
                      ? "rgba(255,255,255,0.1)"
                      : "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    color: "rgba(255,255,255,0.75)",
                    fontSize: s(12),
                    cursor: "pointer",
                    transition: "all .2s",
                    fontFamily: "system-ui, sans-serif",
                  }}
                >
                  Choose Image
                </button>
                {local.path && (
                  <button
                    onClick={handleRemove}
                    onMouseEnter={() => setRemoveHover(true)}
                    onMouseLeave={() => setRemoveHover(false)}
                    style={{
                      padding: "6px 14px",
                      borderRadius: 7,
                      background: removeHover
                        ? "rgba(255,255,255,0.07)"
                        : "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      color: "rgba(255,255,255,0.45)",
                      fontSize: s(12),
                      cursor: "pointer",
                      transition: "all .2s",
                      fontFamily: "system-ui, sans-serif",
                    }}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>

            {/* Path hint */}
            {pathHint && (
              <div
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: s(10),
                  color: "rgba(255,255,255,0.15)",
                  marginTop: 4,
                  marginLeft: 2,
                }}
              >
                {pathHint}
              </div>
            )}
          </div>

          {/* Image Blur */}
          <div style={{ marginBottom: 24 }}>
            <div
              style={{
                fontSize: s(13),
                color: "rgba(255,255,255,0.8)",
                marginBottom: 10,
              }}
            >
              Image Blur: {local.imgBlur || 0}
            </div>
            <input
              type="range"
              min={0}
              max={32}
              value={local.imgBlur || 0}
              onChange={(e) => update({ imgBlur: Number(e.target.value) })}
              style={sliderStyle(imgBlurPct)}
            />
          </div>

          {/* Image Opacity */}
          <div style={{ marginBottom: 24 }}>
            <div
              style={{
                fontSize: s(13),
                color: "rgba(255,255,255,0.8)",
                marginBottom: 10,
              }}
            >
              Image Opacity: {local.imgOpacity || 0}
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={local.imgOpacity || 0}
              onChange={(e) => update({ imgOpacity: Number(e.target.value) })}
              style={sliderStyle(imgOpacityPct)}
            />
            <div
              style={{
                fontSize: s(10),
                color: "rgba(255,255,255,0.3)",
                marginTop: 8,
              }}
            >
              Controls wallpaper transparency.
            </div>
          </div>

          {/* TYPOGRAPHY section label */}
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: s(10),
              fontWeight: 600,
              color: "rgba(255,255,255,0.25)",
              letterSpacing: ".12em",
              textTransform: "uppercase",
              marginBottom: 20,
              marginTop: 12,
            }}
          >
            TYPOGRAPHY
          </div>

          {/* Font Size */}
          <div style={{ marginBottom: 24 }}>
            <div
              style={{
                fontSize: s(13),
                color: "rgba(255,255,255,0.8)",
                marginBottom: 10,
              }}
            >
              Font Size: {fontSize}px
            </div>
            <input
              type="range"
              min={12}
              max={22}
              value={fontSize}
              onChange={(e) => onFontSizeChange(Number(e.target.value))}
              style={sliderStyle(((fontSize - 12) / 10) * 100)}
            />
          </div>

          {/* GIT section label */}
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: s(10),
              fontWeight: 600,
              color: "rgba(255,255,255,0.25)",
              letterSpacing: ".12em",
              textTransform: "uppercase",
              marginBottom: 20,
              marginTop: 12,
            }}
          >
            GIT
          </div>

          {/* Default PR branch */}
          <div style={{ marginBottom: 24 }}>
            <div
              style={{
                fontSize: s(13),
                color: "rgba(255,255,255,0.8)",
                marginBottom: 2,
              }}
            >
              Default PR branch
            </div>
            <div
              style={{
                fontSize: s(11),
                color: "rgba(255,255,255,0.3)",
                marginBottom: 10,
              }}
            >
              Target branch used when creating a pull request
            </div>
            <input
              type="text"
              value={defaultPrBranch ?? ""}
              placeholder="main"
              onChange={(e) => onDefaultPrBranchChange?.(e.target.value)}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (!v) onDefaultPrBranchChange?.("main");
              }}
              spellCheck={false}
              style={{
                width: "100%",
                boxSizing: "border-box",
                height: 32,
                padding: "0 10px",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 7,
                color: "rgba(255,255,255,0.9)",
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: s(12),
                outline: "none",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
