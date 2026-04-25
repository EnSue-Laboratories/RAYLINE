import { useState, useCallback, useEffect } from "react";
import { ArrowLeft, Check, ChevronDown, Image } from "lucide-react";
import { useFontScale } from "../contexts/FontSizeContext";
import { createTranslator } from "../i18n";
import { getPaneSurfaceStyle } from "../utils/paneSurface";
import { DEFAULT_WALLPAPER, normalizeWallpaper } from "../utils/wallpaper";
import { CHIME_SOUNDS, playChime } from "../utils/chime";
import { loadMulticaState, normalizeMulticaServerUrl, saveMulticaState } from "../multica/store";

export default function Settings({ wallpaper, onWallpaperChange, fontSize, onFontSizeChange, defaultPrBranch, onDefaultPrBranchChange, coauthorEnabled = false, onCoauthorEnabledChange, appBlur = 0, onAppBlurChange, appOpacity = 100, onAppOpacityChange, developerMode = false, onDeveloperModeChange, sidebarTerminalEnabled = false, onSidebarTerminalEnabledChange, chromeControlsOnHover = false, onChromeControlsOnHoverChange, notificationSound = "glass", onNotificationSoundChange, notificationsMuted = false, onNotificationsMutedChange, platform = null, locale = "en-US", onLocaleChange, onClose }) {
  const s = useFontScale();
  const t = createTranslator(locale);
  const showUpdaterSettings = platform === "win32";
  const [local, setLocal] = useState(() => normalizeWallpaper(wallpaper) ?? { ...DEFAULT_WALLPAPER });
  const [multica, setMultica] = useState(() => loadMulticaState());
  const [multicaServerDraft, setMulticaServerDraft] = useState(() => loadMulticaState().serverUrl || "");

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
  const normalizedMulticaServerDraft = normalizeMulticaServerUrl(multicaServerDraft);
  const multicaConnected = Boolean(multica.token && multica.serverUrl && (multica.workspaceId || multica.workspaceSlug));
  const multicaStatus = multicaConnected
    ? t("settings.multicaConnected")
    : multica.token && multica.serverUrl
      ? t("settings.multicaAuthenticatedNoWorkspace")
      : multica.serverUrl
        ? t("settings.multicaServerConfigured")
        : t("settings.multicaNotConfigured");
  const multicaServerDirty = normalizedMulticaServerDraft !== (multica.serverUrl || "");

  const refreshMultica = useCallback(() => {
    const next = loadMulticaState();
    setMultica(next);
    setMulticaServerDraft(next.serverUrl || "");
  }, []);

  useEffect(() => {
    const handleRefresh = () => refreshMultica();
    window.addEventListener("multica-refresh", handleRefresh);
    return () => window.removeEventListener("multica-refresh", handleRefresh);
  }, [refreshMultica]);

  const handleSaveMulticaServer = useCallback(() => {
    if (!multicaServerDirty) {
      setMulticaServerDraft(normalizedMulticaServerDraft);
      return;
    }
    const next = saveMulticaState({
      serverUrl: normalizedMulticaServerDraft,
      token: "",
      tokenIssuedAt: 0,
      workspaceId: "",
      workspaceSlug: "",
      agentsCache: [],
      agentsCachedAt: 0,
    });
    setMultica(next);
    setMulticaServerDraft(next.serverUrl || "");
    window.dispatchEvent(new CustomEvent("multica-refresh"));
  }, [multicaServerDirty, normalizedMulticaServerDraft]);

  const handleDisconnectMultica = useCallback(() => {
    const next = saveMulticaState({
      token: "",
      tokenIssuedAt: 0,
      workspaceId: "",
      workspaceSlug: "",
      agentsCache: [],
      agentsCachedAt: 0,
    });
    setMultica(next);
    setMulticaServerDraft(next.serverUrl || "");
    window.dispatchEvent(new CustomEvent("multica-refresh"));
  }, []);

  const handleOpenMulticaSetup = useCallback(() => {
    if (multicaServerDirty) {
      const next = saveMulticaState({
        serverUrl: normalizedMulticaServerDraft,
        token: "",
        tokenIssuedAt: 0,
        workspaceId: "",
        workspaceSlug: "",
        agentsCache: [],
        agentsCachedAt: 0,
      });
      setMultica(next);
      setMulticaServerDraft(next.serverUrl || "");
      window.dispatchEvent(new CustomEvent("multica-refresh"));
    }
    window.dispatchEvent(new CustomEvent("open-multica-setup"));
  }, [multicaServerDirty, normalizedMulticaServerDraft]);

  const sliderPct = (value, min, max) => ((value - min) / (max - min)) * 100;
  const imgBlurPct = sliderPct(local.imgBlur || 0, 0, 32);
  const imgOpacityPct = sliderPct(local.imgOpacity || 0, 0, 100);
  const appBlurPct = sliderPct(appBlur || 0, 0, 20);
  const appOpacityPct = sliderPct(appOpacity || 100, 30, 100);

  // Slider track style helper
  const sliderTrack = (pct) =>
    `linear-gradient(to right, color-mix(in srgb, var(--text-primary) 54%, transparent) 0%, color-mix(in srgb, var(--text-primary) 54%, transparent) ${pct}%, var(--control-border) ${pct}%, var(--control-border) 100%)`;

  const sliderStyle = (pct) => ({
    width: "100%",
    height: 4,
    WebkitAppearance: "none",
    appearance: "none",
    borderRadius: 2,
    background: sliderTrack(pct),
    outline: "none",
    cursor: "pointer",
    accentColor: "var(--text-primary)",
  });

  // Hover state refs for buttons
  const [backHover, setBackHover] = useState(false);
  const [chooseHover, setChooseHover] = useState(false);
  const [removeHover, setRemoveHover] = useState(false);

  // ── Auto-updater state ──────────────────────────────────────────────────
  const [appVersion, setAppVersion] = useState(null);
  const [updaterPhase, setUpdaterPhase] = useState("idle"); // idle|checking|available|not-available|downloading|ready|error
  const [updateVersion, setUpdateVersion] = useState(null);
  const [downloadPct, setDownloadPct] = useState(0);
  const [updateError, setUpdateError] = useState(null);

  useEffect(() => {
    if (!showUpdaterSettings) return;
    window.api?.getAppVersion?.().then(setAppVersion).catch(() => {});
  }, [showUpdaterSettings]);

  useEffect(() => {
    if (!showUpdaterSettings) return;
    const unsub = window.api?.onUpdaterStatus?.((data) => {
      setUpdaterPhase(data.phase);
      if (data.version) setUpdateVersion(data.version);
      if (data.percent != null) setDownloadPct(data.percent);
      if (data.error) setUpdateError(data.error);
      // After "not-available", reset to idle after 3 s
      if (data.phase === "not-available") {
        setTimeout(() => setUpdaterPhase("idle"), 3000);
      }
    });
    return () => unsub?.();
  }, [showUpdaterSettings]);

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
        color: "var(--text-primary)",
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
              ? "var(--control-bg-hover)"
              : "var(--control-bg)",
            border: "1px solid var(--control-border)",
            color: backHover
              ? "color-mix(in srgb, var(--text-primary) 82%, transparent)"
              : "color-mix(in srgb, var(--text-primary) 54%, transparent)",
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
            color: "var(--text-primary)",
          }}
        >
          {t("settings.title")}
        </span>
      </div>

      {/* Scrollable content */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "0 24px max(96px, calc(96px + env(safe-area-inset-bottom)))",
          boxSizing: "border-box",
        }}
      >
        <div style={{ width: "100%", maxWidth: 520, margin: "0 auto" }}>
          {/* APPEARANCE section label */}
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: s(10),
              fontWeight: 600,
              color: "color-mix(in srgb, var(--text-primary) 27%, transparent)",
              letterSpacing: ".12em",
              textTransform: "uppercase",
              marginBottom: 20,
            }}
          >
            {t("settings.appearance")}
          </div>

          <div style={{ marginBottom: 24 }}>
            <div
              style={{
                fontSize: s(13),
                color: "color-mix(in srgb, var(--text-primary) 87%, transparent)",
                marginBottom: 2,
              }}
            >
              {t("settings.language")}
            </div>
            <div
              style={{
                fontSize: s(11),
                color: "color-mix(in srgb, var(--text-primary) 33%, transparent)",
                marginBottom: 10,
              }}
            >
              {t("settings.languageDescription")}
            </div>
            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
              <select
                value={locale}
                onChange={(e) => onLocaleChange?.(e.target.value)}
                style={{
                  width: "100%",
                  height: 32,
                  padding: "0 28px 0 10px",
                  background: "var(--control-bg)",
                  border: "1px solid var(--control-border)",
                  borderRadius: 7,
                  color: "var(--text-primary)",
                  fontFamily: "system-ui, sans-serif",
                  fontSize: s(12),
                  outline: "none",
                  WebkitAppearance: "none",
                  MozAppearance: "none",
                  appearance: "none",
                }}
              >
                <option value="en-US">{t("settings.languageEnglish")}</option>
                <option value="zh-CN">{t("settings.languageChinese")}</option>
              </select>
              <ChevronDown
                size={12}
                strokeWidth={2}
                style={{
                  position: "absolute",
                  right: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "color-mix(in srgb, var(--text-primary) 54%, transparent)",
                  pointerEvents: "none",
                }}
              />
            </div>
          </div>

          <div style={{ marginBottom: 24 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: s(13),
                    color: "color-mix(in srgb, var(--text-primary) 87%, transparent)",
                    marginBottom: 2,
                  }}
                >
                  {t("settings.chromeControlsOnHover")}
                </div>
                <div
                  style={{
                    fontSize: s(11),
                    color: "color-mix(in srgb, var(--text-primary) 33%, transparent)",
                  }}
                >
                  {t("settings.chromeControlsOnHoverDescription")}
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={chromeControlsOnHover}
                onClick={() => onChromeControlsOnHoverChange?.(!chromeControlsOnHover)}
                style={{
                  flexShrink: 0,
                  width: 38,
                  height: 22,
                  borderRadius: 999,
                  border: "1px solid var(--control-border)",
                  background: chromeControlsOnHover ? "rgba(180,220,255,0.35)" : "var(--control-bg)",
                  position: "relative",
                  cursor: "pointer",
                  padding: 0,
                  transition: "background 120ms ease",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: 2,
                    left: chromeControlsOnHover ? 18 : 2,
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    background: "var(--text-primary)",
                    transition: "left 120ms ease",
                  }}
                />
              </button>
            </div>
          </div>


          {/* Wallpaper subsection */}
          <div style={{ marginBottom: 28 }}>
            <div
              style={{
                fontSize: s(13),
                color: "color-mix(in srgb, var(--text-primary) 87%, transparent)",
                marginBottom: 2,
              }}
            >
              {t("settings.wallpaper")}
            </div>
            <div
              style={{
                fontSize: s(11),
                color: "color-mix(in srgb, var(--text-primary) 33%, transparent)",
                marginBottom: 12,
              }}
            >
              {t("settings.wallpaperDescription")}
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
                  border: "1px solid var(--control-border)",
                  background: local.dataUrl
                    ? `url("${local.dataUrl}") center/cover no-repeat`
                    : "var(--control-bg)",
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
                    color="color-mix(in srgb, var(--text-primary) 13%, transparent)"
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
                      ? "color-mix(in srgb, var(--control-bg), var(--text-primary) 7%)"
                      : "var(--control-bg)",
                    border: "1px solid var(--control-border)",
                    color: "color-mix(in srgb, var(--text-primary) 82%, transparent)",
                    fontSize: s(12),
                    cursor: "pointer",
                    transition: "all .2s",
                    fontFamily: "system-ui, sans-serif",
                  }}
                >
                  {t("settings.chooseImage")}
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
                        ? "var(--control-bg-hover)"
                        : "var(--control-bg)",
                      border: "1px solid var(--control-border)",
                      color: "color-mix(in srgb, var(--text-primary) 49%, transparent)",
                      fontSize: s(12),
                      cursor: "pointer",
                      transition: "all .2s",
                      fontFamily: "system-ui, sans-serif",
                    }}
                  >
                    {t("settings.remove")}
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
                  color: "color-mix(in srgb, var(--text-primary) 16%, transparent)",
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
                color: "color-mix(in srgb, var(--text-primary) 87%, transparent)",
                marginBottom: 10,
              }}
            >
              {t("settings.imageBlurValue", { value: local.imgBlur || 0 })}
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
                color: "color-mix(in srgb, var(--text-primary) 87%, transparent)",
                marginBottom: 10,
              }}
            >
              {t("settings.imageOpacityValue", { value: local.imgOpacity || 0 })}
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
                color: "color-mix(in srgb, var(--text-primary) 33%, transparent)",
                marginTop: 8,
              }}
            >
              {t("settings.imageOpacityDescription")}
            </div>
          </div>

          {/* Application Blur */}
          <div style={{ marginBottom: 24 }}>
            <div
              style={{
                fontSize: s(13),
                color: "color-mix(in srgb, var(--text-primary) 87%, transparent)",
                marginBottom: 10,
              }}
            >
              {t("settings.appBlurValue", { value: appBlur || 0 })}
            </div>
            <input
              type="range"
              min={0}
              max={20}
              value={appBlur || 0}
              onChange={(e) => onAppBlurChange?.(Number(e.target.value))}
              style={sliderStyle(appBlurPct)}
            />
            <div
              style={{
                fontSize: s(10),
                color: "color-mix(in srgb, var(--text-primary) 33%, transparent)",
                marginTop: 8,
              }}
            >
              {t("settings.appBlurDescription")}
            </div>
          </div>

          {/* Application Opacity */}
          <div style={{ marginBottom: 24 }}>
            <div
              style={{
                fontSize: s(13),
                color: "color-mix(in srgb, var(--text-primary) 87%, transparent)",
                marginBottom: 10,
              }}
            >
              {t("settings.appOpacityValue", { value: appOpacity ?? 100 })}
            </div>
            <input
              type="range"
              min={30}
              max={100}
              value={appOpacity ?? 100}
              onChange={(e) => onAppOpacityChange?.(Number(e.target.value))}
              style={sliderStyle(appOpacityPct)}
            />
            <div
              style={{
                fontSize: s(10),
                color: "color-mix(in srgb, var(--text-primary) 33%, transparent)",
                marginTop: 8,
              }}
            >
              {t("settings.appOpacityDescription")}
            </div>
          </div>

          {/* TYPOGRAPHY section label */}
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: s(10),
              fontWeight: 600,
              color: "color-mix(in srgb, var(--text-primary) 27%, transparent)",
              letterSpacing: ".12em",
              textTransform: "uppercase",
              marginBottom: 20,
              marginTop: 12,
            }}
          >
            {t("settings.typography")}
          </div>

          {/* Font Size */}
          <div style={{ marginBottom: 24 }}>
            <div
              style={{
                fontSize: s(13),
                color: "color-mix(in srgb, var(--text-primary) 87%, transparent)",
                marginBottom: 10,
              }}
            >
              {t("settings.fontSizeValue", { value: fontSize })}
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

          {/* INTEGRATIONS section label */}
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: s(10),
              fontWeight: 600,
              color: "color-mix(in srgb, var(--text-primary) 27%, transparent)",
              letterSpacing: ".12em",
              textTransform: "uppercase",
              marginBottom: 20,
              marginTop: 12,
            }}
          >
            {t("settings.integrations")}
          </div>

          <div style={{ marginBottom: 28 }}>
            <div
              style={{
                fontSize: s(13),
                color: "color-mix(in srgb, var(--text-primary) 87%, transparent)",
                marginBottom: 2,
              }}
            >
              Multica
            </div>
            <div
              style={{
                fontSize: s(11),
                color: "color-mix(in srgb, var(--text-primary) 33%, transparent)",
                marginBottom: 12,
              }}
            >
              {t("settings.multicaDescription")}
            </div>

            <div style={{ marginBottom: 12 }}>
              <div
                style={{
                  fontSize: s(12),
                  color: multicaConnected ? "rgba(205,255,214,0.88)" : "color-mix(in srgb, var(--text-primary) 78%, transparent)",
                  marginBottom: 4,
                }}
              >
                {multicaStatus}
              </div>
              {multica.email && (
                <div
                  style={{
                    fontSize: s(11),
                    color: "color-mix(in srgb, var(--text-primary) 46%, transparent)",
                    marginBottom: 2,
                  }}
                >
                  {t("settings.email", { value: multica.email })}
                </div>
              )}
              {(multica.workspaceSlug || multica.workspaceId) && (
                <div
                  style={{
                    fontSize: s(11),
                    color: "color-mix(in srgb, var(--text-primary) 46%, transparent)",
                  }}
                >
                  {t("settings.workspace", { value: multica.workspaceSlug || multica.workspaceId })}
                </div>
              )}
            </div>

            <div style={{ marginBottom: 10 }}>
              <div
                style={{
                  fontSize: s(13),
                  color: "color-mix(in srgb, var(--text-primary) 87%, transparent)",
                  marginBottom: 2,
                }}
              >
                {t("settings.serverUrl")}
              </div>
              <div
                style={{
                  fontSize: s(11),
                  color: "color-mix(in srgb, var(--text-primary) 33%, transparent)",
                  marginBottom: 10,
                }}
              >
                {t("settings.serverUrlDescription")}
              </div>
              <input
                type="text"
                value={multicaServerDraft}
                placeholder="https://your-multica-server"
                onChange={(e) => setMulticaServerDraft(e.target.value)}
                spellCheck={false}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  height: 32,
                  padding: "0 10px",
                  background: "var(--control-bg)",
                  border: "1px solid var(--control-border)",
                  borderRadius: 7,
                  color: "var(--text-primary)",
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: s(12),
                  outline: "none",
                }}
              />
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={handleSaveMulticaServer}
                disabled={!multicaServerDirty}
                style={{
                  padding: "6px 14px",
                  borderRadius: 7,
                  background: multicaServerDirty ? "color-mix(in srgb, var(--control-bg), var(--text-primary) 7%)" : "var(--control-bg)",
                  border: "1px solid var(--control-border)",
                  color: multicaServerDirty ? "color-mix(in srgb, var(--text-primary) 89%, transparent)" : "color-mix(in srgb, var(--text-primary) 41%, transparent)",
                  fontSize: s(12),
                  cursor: multicaServerDirty ? "pointer" : "not-allowed",
                  transition: "all .2s",
                  fontFamily: "system-ui, sans-serif",
                }}
              >
                {normalizedMulticaServerDraft ? t("settings.saveServer") : t("settings.clearServer")}
              </button>
              <button
                type="button"
                onClick={handleOpenMulticaSetup}
                style={{
                  padding: "6px 14px",
                  borderRadius: 7,
                  background: "var(--control-bg)",
                  border: "1px solid var(--control-border)",
                  color: "color-mix(in srgb, var(--text-primary) 82%, transparent)",
                  fontSize: s(12),
                  cursor: "pointer",
                  transition: "all .2s",
                  fontFamily: "system-ui, sans-serif",
                }}
              >
                {multicaConnected ? t("settings.manageConnection") : t("settings.openSetup")}
              </button>
              {(multica.token || multica.workspaceId || multica.workspaceSlug) && (
                <button
                  type="button"
                  onClick={handleDisconnectMultica}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 7,
                    background: "var(--control-bg)",
                    border: "1px solid var(--control-border)",
                    color: "color-mix(in srgb, var(--text-primary) 71%, transparent)",
                    fontSize: s(12),
                    cursor: "pointer",
                    transition: "all .2s",
                    fontFamily: "system-ui, sans-serif",
                  }}
                >
                  {t("settings.disconnect")}
                </button>
              )}
            </div>
          </div>

          {/* ADVANCED section label */}
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: s(10),
              fontWeight: 600,
              color: "color-mix(in srgb, var(--text-primary) 27%, transparent)",
              letterSpacing: ".12em",
              textTransform: "uppercase",
              marginBottom: 20,
              marginTop: 12,
            }}
          >
            {t("settings.advanced")}
          </div>

          {/* Developer mode toggle */}
          <div style={{ marginBottom: 24 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: s(13),
                    color: "color-mix(in srgb, var(--text-primary) 87%, transparent)",
                    marginBottom: 2,
                  }}
                >
                  {t("settings.developerMode")}
                </div>
                <div
                  style={{
                    fontSize: s(11),
                    color: "color-mix(in srgb, var(--text-primary) 33%, transparent)",
                  }}
                >
                  {t("settings.developerModeDescription")}
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={developerMode}
                onClick={() => onDeveloperModeChange?.(!developerMode)}
                style={{
                  flexShrink: 0,
                  width: 38,
                  height: 22,
                  borderRadius: 999,
                  border: "1px solid var(--control-border)",
                  background: developerMode ? "rgba(180,220,255,0.35)" : "var(--control-bg)",
                  position: "relative",
                  cursor: "pointer",
                  padding: 0,
                  transition: "background 120ms ease",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: 2,
                    left: developerMode ? 18 : 2,
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    background: "var(--text-primary)",
                    transition: "left 120ms ease",
                  }}
                />
              </button>
            </div>
          </div>

          {developerMode && (
            <>
              {/* TERMINAL section */}
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
                {t("settings.terminal")}
              </div>

              <div style={{ marginBottom: 24 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: s(13),
                        color: "rgba(255,255,255,0.8)",
                        marginBottom: 2,
                      }}
                    >
                      {t("settings.sidebarTerminal")}
                    </div>
                    <div
                      style={{
                        fontSize: s(11),
                        color: "rgba(255,255,255,0.3)",
                      }}
                    >
                      {t("settings.sidebarTerminalDescription")}
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={sidebarTerminalEnabled}
                    onClick={() => onSidebarTerminalEnabledChange?.(!sidebarTerminalEnabled)}
                    style={{
                      flexShrink: 0,
                      width: 38,
                      height: 22,
                      borderRadius: 999,
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: sidebarTerminalEnabled ? "rgba(180,220,255,0.35)" : "rgba(255,255,255,0.06)",
                      position: "relative",
                      cursor: "pointer",
                      padding: 0,
                      transition: "background 120ms ease",
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        top: 2,
                        left: sidebarTerminalEnabled ? 18 : 2,
                        width: 16,
                        height: 16,
                        borderRadius: "50%",
                        background: "rgba(255,255,255,0.9)",
                        transition: "left 120ms ease",
                      }}
                    />
                  </button>
                </div>
              </div>

              {/* NOTIFICATIONS section */}
              <div
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: s(10),
                  fontWeight: 600,
                  color: "color-mix(in srgb, var(--text-primary) 27%, transparent)",
                  letterSpacing: ".12em",
                  textTransform: "uppercase",
                  marginBottom: 20,
                  marginTop: 12,
                }}
              >
                {t("settings.notifications")}
              </div>

              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: s(13), color: "color-mix(in srgb, var(--text-primary) 87%, transparent)", marginBottom: 2 }}>
                  {t("settings.completionChime")}
                </div>
                <div style={{ fontSize: s(11), color: "color-mix(in srgb, var(--text-primary) 33%, transparent)", marginBottom: 10 }}>
                  {t("settings.completionChimeDescription")}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "center" }}>
                    <select
                      value={notificationSound}
                      onChange={(e) => onNotificationSoundChange?.(e.target.value)}
                      disabled={notificationsMuted}
                      style={{
                        width: "100%",
                        height: 32,
                        padding: "0 28px 0 10px",
                        background: "var(--control-bg)",
                        border: "1px solid var(--control-border)",
                        borderRadius: 7,
                        color: "var(--text-primary)",
                        fontFamily: "system-ui, sans-serif",
                        fontSize: s(12),
                        outline: "none",
                        opacity: notificationsMuted ? 0.4 : 1,
                        WebkitAppearance: "none",
                        MozAppearance: "none",
                        appearance: "none",
                      }}
                    >
                      {CHIME_SOUNDS.map((c) => (
                        <option key={c.id} value={c.id}>{c.label}</option>
                      ))}
                    </select>
                    <ChevronDown
                      size={12}
                      strokeWidth={2}
                      style={{
                        position: "absolute",
                        right: 10,
                        top: "50%",
                        transform: "translateY(-50%)",
                        color: "color-mix(in srgb, var(--text-primary) 54%, transparent)",
                        pointerEvents: "none",
                        opacity: notificationsMuted ? 0.4 : 1,
                      }}
                    />
                  </div>

                  <button
                    onClick={() => playChime(notificationSound)}
                    disabled={notificationsMuted}
                    style={{
                      height: 32,
                      padding: "0 12px",
                      background: "var(--control-bg)",
                      border: "1px solid var(--control-border)",
                      borderRadius: 7,
                      color: "color-mix(in srgb, var(--text-primary) 87%, transparent)",
                      fontSize: s(12),
                      cursor: notificationsMuted ? "not-allowed" : "pointer",
                      opacity: notificationsMuted ? 0.4 : 1,
                    }}
                  >
                    {t("settings.preview")}
                  </button>
                </div>
              </div>

              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 24,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={notificationsMuted}
                  onChange={(e) => onNotificationsMutedChange?.(e.target.checked)}
                  style={{
                    opacity: 0,
                    width: 0,
                    height: 0,
                    margin: 0,
                    pointerEvents: "none",
                  }}
                />
                <span
                  aria-hidden
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 5,
                    border: "1px solid var(--control-border)",
                    background: "transparent",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: notificationsMuted ? "inset 0 0 0 1px var(--control-border)" : "none",
                    flexShrink: 0,
                    transition: "border-color .15s, background .15s, box-shadow .15s",
                  }}
                >
                  <Check
                    size={12}
                    strokeWidth={2.2}
                    color="var(--text-primary)"
                    style={{
                      opacity: notificationsMuted ? 1 : 0,
                      transform: notificationsMuted ? "scale(1)" : "scale(0.75)",
                      transition: "opacity .12s ease, transform .12s ease",
                    }}
                  />
                </span>
                <span style={{ fontSize: s(13), color: "color-mix(in srgb, var(--text-primary) 87%, transparent)" }}>
                  {t("settings.muteCompletionChime")}
                </span>
              </label>

              {/* GIT section label */}
              <div
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: s(10),
                  fontWeight: 600,
                  color: "color-mix(in srgb, var(--text-primary) 27%, transparent)",
                  letterSpacing: ".12em",
                  textTransform: "uppercase",
                  marginBottom: 20,
                  marginTop: 12,
                }}
              >
                {t("settings.git")}
              </div>

              {/* Default PR branch */}
              <div style={{ marginBottom: 24 }}>
                <div
                  style={{
                    fontSize: s(13),
                    color: "color-mix(in srgb, var(--text-primary) 87%, transparent)",
                    marginBottom: 2,
                  }}
                >
                  {t("settings.defaultPrBranch")}
                </div>
                <div
                  style={{
                    fontSize: s(11),
                    color: "color-mix(in srgb, var(--text-primary) 33%, transparent)",
                    marginBottom: 10,
                  }}
                >
                  {t("settings.defaultPrBranchDescription")}
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
                    background: "var(--control-bg)",
                    border: "1px solid var(--control-border)",
                    borderRadius: 7,
                    color: "var(--text-primary)",
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: s(12),
                    outline: "none",
                  }}
                />
              </div>

              {/* Auto coauthor toggle */}
              <div style={{ marginBottom: 12 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: s(13),
                        color: "color-mix(in srgb, var(--text-primary) 87%, transparent)",
                        marginBottom: 2,
                      }}
                    >
                      {t("settings.autoCoauthor")}
                    </div>
                    <div
                      style={{
                        fontSize: s(11),
                        color: "color-mix(in srgb, var(--text-primary) 33%, transparent)",
                      }}
                    >
                      {t("settings.autoCoauthorDescription")}
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={coauthorEnabled}
                    onClick={() => onCoauthorEnabledChange?.(!coauthorEnabled)}
                    style={{
                      flexShrink: 0,
                      width: 38,
                      height: 22,
                      borderRadius: 999,
                      border: "1px solid var(--control-border)",
                      background: coauthorEnabled ? "rgba(180,220,255,0.35)" : "var(--control-bg)",
                      position: "relative",
                      cursor: "pointer",
                      padding: 0,
                      transition: "background 120ms ease",
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        top: 2,
                        left: coauthorEnabled ? 18 : 2,
                        width: 16,
                        height: 16,
                        borderRadius: "50%",
                        background: "var(--text-primary)",
                        transition: "left 120ms ease",
                      }}
                    />
                  </button>
                </div>
              </div>
            </>
          )}

          {/* LANGUAGE section */}
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
            {t("settings.language")}
          </div>

          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: s(13), color: "rgba(255,255,255,0.8)", marginBottom: 10 }}>
              {t("settings.languageLabel")}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {[["en-US", "settings.languageEnglish"], ["zh-CN", "settings.languageChinese"]].map(([lc, key]) => {
                const selected = locale === lc;
                return (
                  <button
                    key={lc}
                    type="button"
                    onClick={() => onLocaleChange?.(lc)}
                    style={{
                      padding: "6px 16px",
                      borderRadius: 7,
                      background: selected ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.04)",
                      border: selected ? "1px solid rgba(255,255,255,0.22)" : "1px solid rgba(255,255,255,0.06)",
                      color: selected ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.5)",
                      fontSize: s(12),
                      cursor: "pointer",
                      transition: "all .2s",
                      fontFamily: "system-ui, sans-serif",
                    }}
                  >
                    {t(key)}
                  </button>
                );
              })}
            </div>
          </div>

          {!showUpdaterSettings && (
            <div style={{ marginBottom: 24 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: s(13),
                      color: "rgba(255,255,255,0.8)",
                      marginBottom: 2,
                    }}
                  >
                    {t("settings.chromeControlsOnHover")}
                  </div>
                  <div
                    style={{
                      fontSize: s(11),
                      color: "rgba(255,255,255,0.3)",
                    }}
                  >
                    {t("settings.chromeControlsOnHoverDescription")}
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={chromeControlsOnHover}
                  onClick={() => onChromeControlsOnHoverChange?.(!chromeControlsOnHover)}
                  style={{
                    flexShrink: 0,
                    width: 38,
                    height: 22,
                    borderRadius: 999,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: chromeControlsOnHover ? "rgba(180,220,255,0.35)" : "rgba(255,255,255,0.06)",
                    position: "relative",
                    cursor: "pointer",
                    padding: 0,
                    transition: "background 120ms ease",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      top: 2,
                      left: chromeControlsOnHover ? 18 : 2,
                      width: 16,
                      height: 16,
                      borderRadius: "50%",
                      background: "rgba(255,255,255,0.9)",
                      transition: "left 120ms ease",
                    }}
                  />
                </button>
              </div>
            </div>
          )}

          {showUpdaterSettings && (
            <>
          {/* UPDATES section */}
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
            {t("settings.updates")}
          </div>

          <div style={{ marginBottom: 32 }}>
            {appVersion && (
              <div style={{ fontSize: s(11), color: "rgba(255,255,255,0.35)", fontFamily: "'JetBrains Mono',monospace", marginBottom: 14, letterSpacing: ".04em" }}>
                {t("settings.currentVersion")}  v{appVersion}
              </div>
            )}

            {/* Status text */}
            {updaterPhase === "available" && updateVersion && (
              <div style={{ fontSize: s(12), color: "rgba(165,255,210,0.82)", marginBottom: 10 }}>
                {t("settings.updateAvailable", { version: updateVersion })}
              </div>
            )}
            {updaterPhase === "not-available" && (
              <div style={{ fontSize: s(12), color: "rgba(255,255,255,0.38)", marginBottom: 10 }}>
                {t("settings.upToDate")}
              </div>
            )}
            {updaterPhase === "ready" && (
              <div style={{ fontSize: s(12), color: "rgba(165,255,210,0.82)", marginBottom: 10 }}>
                {t("settings.readyToInstall")}
              </div>
            )}
            {updaterPhase === "error" && (
              <div style={{ fontSize: s(12), color: "rgba(255,120,100,0.82)", marginBottom: 10 }}>
                {t("settings.updateError")}
                {updateError && <span style={{ opacity: 0.6, marginLeft: 6, fontFamily: "'JetBrains Mono',monospace", fontSize: s(10) }}>{updateError.slice(0, 80)}</span>}
              </div>
            )}

            {/* Progress bar when downloading */}
            {updaterPhase === "downloading" && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: s(12), color: "rgba(255,255,255,0.55)", marginBottom: 6 }}>
                  {t("settings.downloading", { pct: downloadPct })}
                </div>
                <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${downloadPct}%`, background: "rgba(255,255,255,0.4)", transition: "width .3s ease", borderRadius: 2 }} />
                </div>
              </div>
            )}

            {/* Action button */}
            <div style={{ display: "flex", gap: 8 }}>
              {(updaterPhase === "idle" || updaterPhase === "not-available") && (
                <button
                  type="button"
                  onClick={() => { setUpdateError(null); window.api?.checkForUpdates?.(); }}
                  style={{
                    padding: "6px 14px", borderRadius: 7,
                    background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.06)",
                    color: "rgba(255,255,255,0.75)", fontSize: s(12), cursor: "pointer",
                    transition: "all .2s", fontFamily: "system-ui, sans-serif",
                  }}
                >
                  {t("settings.checkUpdates")}
                </button>
              )}
              {updaterPhase === "checking" && (
                <button
                  type="button"
                  disabled
                  style={{
                    padding: "6px 14px", borderRadius: 7,
                    background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
                    color: "rgba(255,255,255,0.38)", fontSize: s(12), cursor: "not-allowed",
                    fontFamily: "system-ui, sans-serif",
                  }}
                >
                  {t("settings.checking")}
                </button>
              )}
              {updaterPhase === "available" && (
                <button
                  type="button"
                  onClick={() => window.api?.downloadUpdate?.()}
                  style={{
                    padding: "6px 14px", borderRadius: 7,
                    background: "rgba(165,255,210,0.12)", border: "1px solid rgba(165,255,210,0.2)",
                    color: "rgba(165,255,210,0.9)", fontSize: s(12), cursor: "pointer",
                    transition: "all .2s", fontFamily: "system-ui, sans-serif",
                  }}
                >
                  {t("settings.checkUpdates")}
                </button>
              )}
              {updaterPhase === "ready" && (
                <button
                  type="button"
                  onClick={() => window.api?.installUpdate?.()}
                  style={{
                    padding: "6px 14px", borderRadius: 7,
                    background: "rgba(165,255,210,0.18)", border: "1px solid rgba(165,255,210,0.28)",
                    color: "rgba(165,255,210,0.95)", fontSize: s(12), cursor: "pointer",
                    transition: "all .2s", fontFamily: "system-ui, sans-serif", fontWeight: 600,
                  }}
                >
                  {t("settings.installRestart")}
                </button>
              )}
              {updaterPhase === "error" && (
                <button
                  type="button"
                  onClick={() => { setUpdateError(null); window.api?.checkForUpdates?.(); }}
                  style={{
                    padding: "6px 14px", borderRadius: 7,
                    background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.06)",
                    color: "rgba(255,255,255,0.6)", fontSize: s(12), cursor: "pointer",
                    transition: "all .2s", fontFamily: "system-ui, sans-serif",
                  }}
                >
                  {t("settings.retryUpdate")}
                </button>
              )}
            </div>
          </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
