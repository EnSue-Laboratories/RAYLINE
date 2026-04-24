import { useState, useCallback, useEffect } from "react";
import { ArrowLeft, Check, ChevronDown, Image } from "lucide-react";
import { useFontScale } from "../contexts/FontSizeContext";
import { getPaneSurfaceStyle } from "../utils/paneSurface";
import { DEFAULT_WALLPAPER, normalizeWallpaper } from "../utils/wallpaper";
import { CHIME_SOUNDS, playChime } from "../utils/chime";
import { loadMulticaState, normalizeMulticaServerUrl, saveMulticaState } from "../multica/store";
import { createTranslator } from "../i18n";
import WindowDragSpacer from "./WindowDragSpacer";

export default function Settings({ wallpaper, onWallpaperChange, fontSize, onFontSizeChange, defaultPrBranch, onDefaultPrBranchChange, coauthorEnabled = false, onCoauthorEnabledChange, appBlur = 0, onAppBlurChange, appOpacity = 100, onAppOpacityChange, developerMode = false, onDeveloperModeChange, chromeControlsOnHover = false, onChromeControlsOnHoverChange, notificationSound = "glass", onNotificationSoundChange, notificationsMuted = false, onNotificationsMutedChange, locale = "en-US", onLocaleChange, byokProviders = [], onByokProvidersChange, onClose }) {
  const s = useFontScale();
  const t = createTranslator(locale);
  const [local, setLocal] = useState(() => normalizeWallpaper(wallpaper) ?? { ...DEFAULT_WALLPAPER });
  const [multica, setMultica] = useState(() => loadMulticaState());
  const [multicaServerDraft, setMulticaServerDraft] = useState(() => loadMulticaState().serverUrl || "");

  // BYOK state
  const [byokAddOpen, setByokAddOpen] = useState(false);
  const [byokDraftType, setByokDraftType] = useState("");
  const [byokDraftKey, setByokDraftKey] = useState("");
  const [byokDraftBaseUrl, setByokDraftBaseUrl] = useState("");
  const [byokDraftName, setByokDraftName] = useState("");
  const [byokDraftModelId, setByokDraftModelId] = useState("");
  const [byokDraftId, setByokDraftId] = useState(null); // null means adding new
  const [byokTestStatus, setByokTestStatus] = useState(null); // { ok: boolean, message?: string, loading: boolean }

  const [prevWallpaper, setPrevWallpaper] = useState(wallpaper);
  if (wallpaper !== prevWallpaper) {
    setPrevWallpaper(wallpaper);
    setLocal(normalizeWallpaper(wallpaper) ?? { ...DEFAULT_WALLPAPER });
  }

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
      <WindowDragSpacer />

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
              color: "rgba(255,255,255,0.25)",
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
                color: "rgba(255,255,255,0.8)",
                marginBottom: 2,
              }}
            >
              {t("settings.language")}
            </div>
            <div
              style={{
                fontSize: s(11),
                color: "rgba(255,255,255,0.3)",
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
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 7,
                  color: "rgba(255,255,255,0.9)",
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
                  color: "rgba(255,255,255,0.5)",
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

          {/* Wallpaper subsection */}
          <div style={{ marginBottom: 28 }}>
            <div
              style={{
                fontSize: s(13),
                color: "rgba(255,255,255,0.8)",
                marginBottom: 2,
              }}
            >
              {t("settings.wallpaper")}
            </div>
            <div
              style={{
                fontSize: s(11),
                color: "rgba(255,255,255,0.3)",
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
                color: "rgba(255,255,255,0.8)",
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
                color: "rgba(255,255,255,0.3)",
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
                color: "rgba(255,255,255,0.8)",
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
                color: "rgba(255,255,255,0.3)",
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
                color: "rgba(255,255,255,0.8)",
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
                color: "rgba(255,255,255,0.3)",
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
              color: "rgba(255,255,255,0.25)",
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
                color: "rgba(255,255,255,0.8)",
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
              color: "rgba(255,255,255,0.25)",
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
                color: "rgba(255,255,255,0.8)",
                marginBottom: 2,
              }}
            >
              {t("settings.multica")}
            </div>
            <div
              style={{
                fontSize: s(11),
                color: "rgba(255,255,255,0.3)",
                marginBottom: 12,
              }}
            >
              {t("settings.multicaDescription")}
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
                  {t("settings.email", { value: multica.email })}
                </div>
              )}
              {(multica.workspaceSlug || multica.workspaceId) && (
                <div
                  style={{
                    fontSize: s(11),
                    color: "rgba(255,255,255,0.42)",
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
                  color: "rgba(255,255,255,0.8)",
                  marginBottom: 2,
                }}
              >
                {t("settings.serverUrl")}
              </div>
              <div
                style={{
                  fontSize: s(11),
                  color: "rgba(255,255,255,0.3)",
                  marginBottom: 10,
                }}
              >
                {t("settings.serverUrlDescription")}
              </div>
              <input
                type="text"
                value={multicaServerDraft}
                placeholder={t("settings.serverUrlPlaceholder")}
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
                {normalizedMulticaServerDraft ? t("settings.saveServer") : t("settings.clearServer")}
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
                {multicaConnected ? t("settings.manageConnection") : t("settings.openSetup")}
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
              color: "rgba(255,255,255,0.25)",
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
                    color: "rgba(255,255,255,0.8)",
                    marginBottom: 2,
                  }}
                >
                  {t("settings.developerMode")}
                </div>
                <div
                  style={{
                    fontSize: s(11),
                    color: "rgba(255,255,255,0.3)",
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
              {/* BYOK section */}
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
                {t("settings.byok")}
              </div>

              <div style={{ marginBottom: 28 }}>
                {byokProviders.length === 0 && !byokAddOpen && (
                  <div style={{ fontSize: s(12), color: "rgba(255,255,255,0.35)", marginBottom: 12 }}>
                    {t("settings.byokNoProviders")}
                  </div>
                )}

                {byokProviders.map((p) => (
                  <div
                    key={p.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "8px 12px",
                      marginBottom: 6,
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      borderRadius: 7,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: s(12), color: "rgba(255,255,255,0.8)" }}>
                        {p.name}
                      </div>
                      <div style={{ fontSize: s(11), color: "rgba(255,255,255,0.35)", fontFamily: "'JetBrains Mono', monospace" }}>
                        {p.apiKey || "(no key)"}
                        {p.baseUrl ? ` · ${p.baseUrl}` : ""}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        setByokDraftId(p.id);
                        setByokDraftType(p.id.startsWith("custom-") ? "custom" : p.id);
                        setByokDraftName(p.name || "");
                        setByokDraftKey(""); // Keep empty to avoid showing masked key, but handle in save
                        setByokDraftBaseUrl(p.baseUrl || "");
                        setByokDraftModelId(p.defaultModelId || "");
                        setByokAddOpen(true);
                      }}
                      style={{
                        padding: "4px 10px",
                        borderRadius: 5,
                        background: "rgba(255,255,255,0.05)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        color: "rgba(255,255,255,0.8)",
                        fontSize: s(11),
                        cursor: "pointer",
                        marginRight: 6,
                        flexShrink: 0,
                        fontFamily: "system-ui, sans-serif",
                      }}
                    >
                      {t("common.edit")}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (window.api?.byokDeleteProvider) {
                          await window.api.byokDeleteProvider(p.id);
                          const updated = await window.api.byokLoadProviders();
                          onByokProvidersChange?.(updated);
                        }
                      }}
                      style={{
                        padding: "4px 10px",
                        borderRadius: 5,
                        background: "rgba(255,180,180,0.08)",
                        border: "1px solid rgba(255,180,180,0.15)",
                        color: "rgba(255,180,180,0.7)",
                        fontSize: s(11),
                        cursor: "pointer",
                        flexShrink: 0,
                        fontFamily: "system-ui, sans-serif",
                      }}
                    >
                      {t("settings.byokDelete")}
                    </button>
                  </div>
                ))}

                {byokAddOpen ? (
                  <div
                    style={{
                      padding: 12,
                      background: "rgba(255,255,255,0.02)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      borderRadius: 7,
                      marginTop: 8,
                    }}
                  >
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: s(12), color: "rgba(255,255,255,0.7)", marginBottom: 4 }}>
                        {t("settings.byokProviderType")}
                      </div>
                      <select
                        value={byokDraftType}
                        onChange={(e) => {
                          setByokDraftType(e.target.value);
                          setByokDraftBaseUrl(
                            e.target.value === "anthropic" ? "https://api.anthropic.com" :
                            e.target.value === "openai" ? "https://api.openai.com" : ""
                          );
                          setByokDraftName(
                            e.target.value === "anthropic" ? "Anthropic" :
                            e.target.value === "openai" ? "OpenAI" : ""
                          );
                          setByokTestStatus(null);
                        }}
                        style={{
                          width: "100%",
                          height: 32,
                          padding: "0 10px",
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(255,255,255,0.08)",
                          borderRadius: 7,
                          color: "rgba(255,255,255,0.9)",
                          fontFamily: "system-ui, sans-serif",
                          fontSize: s(12),
                          outline: "none",
                          WebkitAppearance: "none",
                          MozAppearance: "none",
                          appearance: "none",
                        }}
                      >
                        <option value="">{t("settings.byokSelectProvider")}</option>
                        <option value="anthropic">{t("settings.byokAnthropic")}</option>
                        <option value="openai">{t("settings.byokOpenAI")}</option>
                        <option value="custom">{t("settings.byokCustom")}</option>
                      </select>
                    </div>

                    {byokDraftType === "custom" && (
                      <>
                        <div style={{ marginBottom: 10 }}>
                          <div style={{ fontSize: s(12), color: "rgba(255,255,255,0.7)", marginBottom: 4 }}>
                            {t("settings.byokCustomName")}
                          </div>
                          <input
                            type="text"
                            value={byokDraftName}
                            onChange={(e) => setByokDraftName(e.target.value)}
                            placeholder={t("settings.byokCustomNamePlaceholder") || "e.g., My Local Inference"}
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
                        <div style={{ marginBottom: 10 }}>
                          <div style={{ fontSize: s(12), color: "rgba(255,255,255,0.7)", marginBottom: 4 }}>
                            {t("settings.byokCustomModelId")}
                          </div>
                          <input
                            type="text"
                            value={byokDraftModelId}
                            onChange={(e) => setByokDraftModelId(e.target.value)}
                            placeholder="e.g., llama3, qwen-coder"
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
                      </>
                    )}

                    {byokDraftType && (
                      <>
                        <div style={{ marginBottom: 10 }}>
                          <div style={{ fontSize: s(12), color: "rgba(255,255,255,0.7)", marginBottom: 4 }}>
                            {t("settings.byokApiKey")}
                          </div>
                          <input
                            type="password"
                            value={byokDraftKey}
                            onChange={(e) => setByokDraftKey(e.target.value)}
                            placeholder="sk-..."
                            spellCheck={false}
                            autoComplete="off"
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

                        {(byokDraftType === "custom") && (
                          <div style={{ marginBottom: 10 }}>
                            <div style={{ fontSize: s(12), color: "rgba(255,255,255,0.7)", marginBottom: 4 }}>
                              {t("settings.byokBaseUrl")}
                            </div>
                            <input
                              type="text"
                              value={byokDraftBaseUrl}
                              onChange={(e) => setByokDraftBaseUrl(e.target.value)}
                              placeholder={t("settings.byokBaseUrlPlaceholder")}
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
                        )}

                        {byokTestStatus && (
                          <div style={{
                            marginBottom: 10,
                            fontSize: s(11),
                            color: byokTestStatus.ok ? "rgba(100,255,150,0.8)" : "rgba(255,100,100,0.8)",
                            padding: "4px 8px",
                            background: "rgba(0,0,0,0.2)",
                            borderRadius: 4,
                          }}>
                            {byokTestStatus.loading ? t("settings.byokTesting") : (byokTestStatus.ok ? t("settings.byokTestSuccessful") : t("settings.byokTestFailed", { error: byokTestStatus.message }))}
                          </div>
                        )}

                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            type="button"
                            disabled={
                              !byokDraftType ||
                              (byokDraftType !== "custom" && !byokDraftKey && !byokDraftId) ||
                              (byokDraftType === "custom" && (!byokDraftBaseUrl || !byokDraftModelId)) ||
                              byokTestStatus?.loading
                            }
                            onClick={async () => {
                              if (!window.api?.byokTestConnectivity) return;
                              setByokTestStatus({ loading: true });
                              try {
                                const res = await window.api.byokTestConnectivity({
                                  apiKey: byokDraftKey,
                                  baseUrl: byokDraftBaseUrl || (byokDraftType === "anthropic" ? "https://api.anthropic.com" : "https://api.openai.com"),
                                  endpoint: byokDraftType,
                                  modelId: byokDraftModelId,
                                  providerId: byokDraftId,
                                });
                                setByokTestStatus({ ok: res.ok, message: res.error, loading: false });
                              } catch (err) {
                                setByokTestStatus({ ok: false, message: err.message, loading: false });
                              }
                            }}
                            style={{
                              padding: "6px 14px",
                              borderRadius: 7,
                              background: "rgba(255,255,255,0.05)",
                              border: "1px solid rgba(255,255,255,0.1)",
                              color: "rgba(255,255,255,0.8)",
                              fontSize: s(12),
                              cursor: "pointer",
                              fontFamily: "system-ui, sans-serif",
                            }}
                          >
                            {t("settings.byokTest")}
                          </button>
                          <button
                            type="button"
                            disabled={
                              !byokDraftType ||
                              (byokDraftType !== "custom" && !byokDraftKey && !byokDraftId) ||
                              (byokDraftType === "custom" && (!byokDraftBaseUrl || !byokDraftModelId))
                            }
                            onClick={async () => {
                              if (!window.api?.byokSaveProviders) return;
                              const id = byokDraftId || (byokDraftType === "custom"
                                ? `custom-${(byokDraftName || "provider").toLowerCase().replace(/\s+/g, "-")}-${new Date().getTime()}`
                                : byokDraftType);
                              const name = byokDraftName || byokDraftType;
                              
                              const existing = byokProviders.map((p) => ({ ...p }));
                              const idx = existing.findIndex((p) => p.id === id);
                              
                              const newEntry = { 
                                id, 
                                name, 
                                apiKey: byokDraftKey, 
                                baseUrl: byokDraftBaseUrl, 
                                defaultModelId: byokDraftModelId 
                              };

                              if (idx >= 0) {
                                // If key is empty and we are editing, the backend handler will preserve the old key
                                existing[idx] = newEntry;
                              } else {
                                existing.push(newEntry);
                              }
                              
                              await window.api.byokSaveProviders(existing);
                              const updated = await window.api.byokLoadProviders();
                              onByokProvidersChange?.(updated);
                              setByokAddOpen(false);
                              setByokDraftId(null);
                              setByokDraftType("");
                              setByokDraftKey("");
                              setByokDraftBaseUrl("");
                              setByokDraftName("");
                              setByokDraftModelId("");
                            }}
                            style={{
                              padding: "6px 14px",
                              borderRadius: 7,
                              background: (!(!byokDraftType || (byokDraftType !== "custom" && !byokDraftKey && !byokDraftId) || (byokDraftType === "custom" && (!byokDraftBaseUrl || !byokDraftModelId)))) ? "rgba(180,220,255,0.15)" : "rgba(255,255,255,0.03)",
                              border: "1px solid rgba(255,255,255,0.06)",
                              color: (!(!byokDraftType || (byokDraftType !== "custom" && !byokDraftKey && !byokDraftId) || (byokDraftType === "custom" && (!byokDraftBaseUrl || !byokDraftModelId)))) ? "rgba(180,220,255,0.9)" : "rgba(255,255,255,0.2)",
                              fontSize: s(12),
                              cursor: (!(!byokDraftType || (byokDraftType !== "custom" && !byokDraftKey && !byokDraftId) || (byokDraftType === "custom" && (!byokDraftBaseUrl || !byokDraftModelId)))) ? "pointer" : "default",
                              fontFamily: "system-ui, sans-serif",
                            }}
                          >
                            {t("settings.byokSave")}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setByokAddOpen(false);
                              setByokDraftId(null);
                              setByokDraftType("");
                              setByokDraftKey("");
                              setByokDraftBaseUrl("");
                              setByokDraftName("");
                              setByokDraftModelId("");
                            }}
                            style={{
                              padding: "6px 14px",
                              borderRadius: 7,
                              background: "rgba(255,255,255,0.03)",
                              border: "1px solid rgba(255,255,255,0.06)",
                              color: "rgba(255,255,255,0.65)",
                              fontSize: s(12),
                              cursor: "pointer",
                              fontFamily: "system-ui, sans-serif",
                            }}
                          >
                            {t("settings.byokCancel")}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setByokAddOpen(true)}
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
                      marginTop: 4,
                    }}
                  >
                    {t("settings.byokAddProvider")}
                  </button>
                )}
              </div>

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
                {t("settings.notifications")}
              </div>

              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: s(13), color: "rgba(255,255,255,0.8)", marginBottom: 2 }}>
                  {t("settings.completionChime")}
                </div>
                <div style={{ fontSize: s(11), color: "rgba(255,255,255,0.3)", marginBottom: 10 }}>
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
                  {t("settings.muteCompletionChime")}
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
                {t("settings.git")}
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
                  {t("settings.defaultPrBranch")}
                </div>
                <div
                  style={{
                    fontSize: s(11),
                    color: "rgba(255,255,255,0.3)",
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
                      {t("settings.autoCoauthor")}
                    </div>
                    <div
                      style={{
                        fontSize: s(11),
                        color: "rgba(255,255,255,0.3)",
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
        </div>
      </div>
    </div>
  );
}
