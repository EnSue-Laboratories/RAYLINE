import { useState, useCallback, useEffect } from "react";
import { ArrowLeft, Check, ChevronDown, Image } from "lucide-react";
import { useFontScale } from "../contexts/FontSizeContext";
import { useLanguage } from "../contexts/LanguageContext";
import { t } from "../i18n";
import { getPaneSurfaceStyle } from "../utils/paneSurface";
import { DEFAULT_WALLPAPER, normalizeWallpaper } from "../utils/wallpaper";
import { CHIME_SOUNDS, playChime } from "../utils/chime";
import { loadMulticaState, normalizeMulticaServerUrl, saveMulticaState } from "../multica/store";

export default function Settings({ wallpaper, onWallpaperChange, fontSize, onFontSizeChange, defaultPrBranch, onDefaultPrBranchChange, coauthorEnabled = false, onCoauthorEnabledChange, appBlur = 0, onAppBlurChange, appOpacity = 100, onAppOpacityChange, developerMode = false, onDeveloperModeChange, notificationSound = "glass", onNotificationSoundChange, notificationsMuted = false, onNotificationsMutedChange, language = "en", onLanguageChange, onClose }) {
  const s = useFontScale();
  // Consume language context so we re-render when language changes
  useLanguage();
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
    ? t("multica_status_connected")
    : multica.token && multica.serverUrl
      ? t("multica_status_auth_no_ws")
      : multica.serverUrl
        ? t("multica_status_server_only")
        : t("multica_status_none");
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

  // ── Auto-updater state ──────────────────────────────────────────────────
  const [appVersion, setAppVersion] = useState(null);
  const [updaterPhase, setUpdaterPhase] = useState("idle"); // idle|checking|available|not-available|downloading|ready|error
  const [updateVersion, setUpdateVersion] = useState(null);
  const [downloadPct, setDownloadPct] = useState(0);
  const [updateError, setUpdateError] = useState(null);

  useEffect(() => {
    window.api?.getAppVersion?.().then(setAppVersion).catch(() => {});
  }, []);

  useEffect(() => {
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
  }, []);

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
          {t("settings")}
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
              color: "rgba(255,255,255,0.25)",
              letterSpacing: ".12em",
              textTransform: "uppercase",
              marginBottom: 20,
            }}
          >
            {t("section_appearance")}
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
              {t("wallpaper")}
            </div>
            <div
              style={{
                fontSize: s(11),
                color: "rgba(255,255,255,0.3)",
                marginBottom: 12,
              }}
            >
              {t("wallpaper_desc")}
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
                  {t("choose_image")}
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
                    {t("remove")}
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
              {t("image_blur")}: {local.imgBlur || 0}
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
              {t("image_opacity")}: {local.imgOpacity || 0}
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
              {t("image_opacity_desc")}
            </div>
          </div>

          {/* Application Blur */}
          <div style={{ marginBottom: 24 }}>
            <div
              style={{
                fontSize: s(13),
                color: "rgba(255,255,255,0.8)",
                marginBottom: 10,
              }}
            >
              {t("app_blur")}: {appBlur || 0}
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
                color: "rgba(255,255,255,0.3)",
                marginTop: 8,
              }}
            >
              {t("app_blur_desc")}
            </div>
          </div>

          {/* Application Opacity */}
          <div style={{ marginBottom: 24 }}>
            <div
              style={{
                fontSize: s(13),
                color: "rgba(255,255,255,0.8)",
                marginBottom: 10,
              }}
            >
              {t("app_opacity")}: {appOpacity ?? 100}
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
                color: "rgba(255,255,255,0.3)",
                marginTop: 8,
              }}
            >
              {t("app_opacity_desc")}
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
            {t("section_typography")}
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
              {t("font_size")}: {fontSize}px
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
              color: "rgba(255,255,255,0.25)",
              letterSpacing: ".12em",
              textTransform: "uppercase",
              marginBottom: 20,
              marginTop: 12,
            }}
          >
            {t("section_integrations")}
          </div>

          <div style={{ marginBottom: 28 }}>
            <div
              style={{
                fontSize: s(13),
                color: "rgba(255,255,255,0.8)",
                marginBottom: 2,
              }}
            >
              Multica
            </div>
            <div
              style={{
                fontSize: s(11),
                color: "rgba(255,255,255,0.3)",
                marginBottom: 12,
              }}
            >
              {t("multica_desc")}
            </div>

            <div style={{ marginBottom: 12 }}>
              <div
                style={{
                  fontSize: s(12),
                  color: multicaConnected ? "rgba(205,255,214,0.88)" : "rgba(255,255,255,0.72)",
                  marginBottom: 4,
                }}
              >
                {multicaStatus}
              </div>
              {multica.email && (
                <div
                  style={{
                    fontSize: s(11),
                    color: "rgba(255,255,255,0.42)",
                    marginBottom: 2,
                  }}
                >
                  {t("multica_email")} {multica.email}
                </div>
              )}
              {(multica.workspaceSlug || multica.workspaceId) && (
                <div
                  style={{
                    fontSize: s(11),
                    color: "rgba(255,255,255,0.42)",
                  }}
                >
                  {t("multica_workspace")} {multica.workspaceSlug || multica.workspaceId}
                </div>
              )}
            </div>

            <div style={{ marginBottom: 10 }}>
              <div
                style={{
                  fontSize: s(13),
                  color: "rgba(255,255,255,0.8)",
                  marginBottom: 2,
                }}
              >
                {t("multica_server_url")}
              </div>
              <div
                style={{
                  fontSize: s(11),
                  color: "rgba(255,255,255,0.3)",
                  marginBottom: 10,
                }}
              >
                {t("multica_server_url_desc")}
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

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={handleSaveMulticaServer}
                disabled={!multicaServerDirty}
                style={{
                  padding: "6px 14px",
                  borderRadius: 7,
                  background: multicaServerDirty ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  color: multicaServerDirty ? "rgba(255,255,255,0.82)" : "rgba(255,255,255,0.38)",
                  fontSize: s(12),
                  cursor: multicaServerDirty ? "pointer" : "not-allowed",
                  transition: "all .2s",
                  fontFamily: "system-ui, sans-serif",
                }}
              >
                {normalizedMulticaServerDraft ? t("save_server") : t("clear_server")}
              </button>
              <button
                type="button"
                onClick={handleOpenMulticaSetup}
                style={{
                  padding: "6px 14px",
                  borderRadius: 7,
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  color: "rgba(255,255,255,0.75)",
                  fontSize: s(12),
                  cursor: "pointer",
                  transition: "all .2s",
                  fontFamily: "system-ui, sans-serif",
                }}
              >
                {multicaConnected ? t("manage_connection") : t("open_setup")}
              </button>
              {(multica.token || multica.workspaceId || multica.workspaceSlug) && (
                <button
                  type="button"
                  onClick={handleDisconnectMultica}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 7,
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    color: "rgba(255,255,255,0.65)",
                    fontSize: s(12),
                    cursor: "pointer",
                    transition: "all .2s",
                    fontFamily: "system-ui, sans-serif",
                  }}
                >
                  {t("disconnect")}
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
              color: "rgba(255,255,255,0.25)",
              letterSpacing: ".12em",
              textTransform: "uppercase",
              marginBottom: 20,
              marginTop: 12,
            }}
          >
            {t("section_advanced")}
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
                    color: "rgba(255,255,255,0.8)",
                    marginBottom: 2,
                  }}
                >
                  {t("developer_mode")}
                </div>
                <div
                  style={{
                    fontSize: s(11),
                    color: "rgba(255,255,255,0.3)",
                  }}
                >
                  {t("developer_mode_desc")}
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
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: developerMode ? "rgba(180,220,255,0.35)" : "rgba(255,255,255,0.06)",
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
                    background: "rgba(255,255,255,0.9)",
                    transition: "left 120ms ease",
                  }}
                />
              </button>
            </div>
          </div>

          {developerMode && (
            <>
              {/* NOTIFICATIONS section */}
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
                {t("section_notifications")}
              </div>

              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: s(13), color: "rgba(255,255,255,0.8)", marginBottom: 2 }}>
                  {t("completion_chime")}
                </div>
                <div style={{ fontSize: s(11), color: "rgba(255,255,255,0.3)", marginBottom: 10 }}>
                  {t("completion_chime_desc")}
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
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: 7,
                        color: "rgba(255,255,255,0.9)",
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
                        color: "rgba(255,255,255,0.5)",
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
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 7,
                      color: "rgba(255,255,255,0.8)",
                      fontSize: s(12),
                      cursor: notificationsMuted ? "not-allowed" : "pointer",
                      opacity: notificationsMuted ? 0.4 : 1,
                    }}
                  >
                    {t("preview")}
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
                    border: "1px solid rgba(255,255,255,0.18)",
                    background: "transparent",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: notificationsMuted ? "inset 0 0 0 1px rgba(255,255,255,0.06)" : "none",
                    flexShrink: 0,
                    transition: "border-color .15s, background .15s, box-shadow .15s",
                  }}
                >
                  <Check
                    size={12}
                    strokeWidth={2.2}
                    color="rgba(255,255,255,0.86)"
                    style={{
                      opacity: notificationsMuted ? 1 : 0,
                      transform: notificationsMuted ? "scale(1)" : "scale(0.75)",
                      transition: "opacity .12s ease, transform .12s ease",
                    }}
                  />
                </span>
                <span style={{ fontSize: s(13), color: "rgba(255,255,255,0.8)" }}>
                  {t("mute_chime")}
                </span>
              </label>

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
                {t("section_git")}
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
                  {t("default_pr_branch")}
                </div>
                <div
                  style={{
                    fontSize: s(11),
                    color: "rgba(255,255,255,0.3)",
                    marginBottom: 10,
                  }}
                >
                  {t("default_pr_branch_desc")}
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
                        color: "rgba(255,255,255,0.8)",
                        marginBottom: 2,
                      }}
                    >
                      {t("auto_coauthor")}
                    </div>
                    <div
                      style={{
                        fontSize: s(11),
                        color: "rgba(255,255,255,0.3)",
                      }}
                    >
                      {t("auto_coauthor_desc")}
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
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: coauthorEnabled ? "rgba(180,220,255,0.35)" : "rgba(255,255,255,0.06)",
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
                        background: "rgba(255,255,255,0.9)",
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
            {t("section_language")}
          </div>

          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: s(13), color: "rgba(255,255,255,0.8)", marginBottom: 10 }}>
              {t("language_label")}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {["en", "zh"].map((lang) => {
                const selected = language === lang;
                return (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => onLanguageChange?.(lang)}
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
                    {t(lang === "en" ? "lang_en" : "lang_zh")}
                  </button>
                );
              })}
            </div>
          </div>

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
            {t("section_updates")}
          </div>

          <div style={{ marginBottom: 32 }}>
            {appVersion && (
              <div style={{ fontSize: s(11), color: "rgba(255,255,255,0.35)", fontFamily: "'JetBrains Mono',monospace", marginBottom: 14, letterSpacing: ".04em" }}>
                {t("current_version")}  v{appVersion}
              </div>
            )}

            {/* Status text */}
            {updaterPhase === "available" && updateVersion && (
              <div style={{ fontSize: s(12), color: "rgba(165,255,210,0.82)", marginBottom: 10 }}>
                {t("update_available", updateVersion)}
              </div>
            )}
            {updaterPhase === "not-available" && (
              <div style={{ fontSize: s(12), color: "rgba(255,255,255,0.38)", marginBottom: 10 }}>
                {t("up_to_date")}
              </div>
            )}
            {updaterPhase === "ready" && (
              <div style={{ fontSize: s(12), color: "rgba(165,255,210,0.82)", marginBottom: 10 }}>
                {t("ready_to_install")}
              </div>
            )}
            {updaterPhase === "error" && (
              <div style={{ fontSize: s(12), color: "rgba(255,120,100,0.82)", marginBottom: 10 }}>
                {t("update_error")}
                {updateError && <span style={{ opacity: 0.6, marginLeft: 6, fontFamily: "'JetBrains Mono',monospace", fontSize: s(10) }}>{updateError.slice(0, 80)}</span>}
              </div>
            )}

            {/* Progress bar when downloading */}
            {updaterPhase === "downloading" && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: s(12), color: "rgba(255,255,255,0.55)", marginBottom: 6 }}>
                  {t("downloading", downloadPct)}
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
                  {t("check_updates")}
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
                  {t("checking")}
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
                  {t("check_updates")}
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
                  {t("install_restart")}
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
                  {t("retry")}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
