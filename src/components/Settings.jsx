import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { ArrowLeft, Check, ChevronDown, Copy, Image, Keyboard, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useFontScale } from "../contexts/FontSizeContext";
import { createTranslator } from "../i18n";
import { getPaneSurfaceStyle } from "../utils/paneSurface";
import { DEFAULT_WALLPAPER, normalizeWallpaper } from "../utils/wallpaper";
import { CHIME_SOUNDS, playChime } from "../utils/chime";
import { loadMulticaState, normalizeMulticaServerUrl, saveMulticaState } from "../multica/store";
import { useOpenCodeModels } from "../data/openCodeModels.jsx";
import WindowDragSpacer from "./WindowDragSpacer";

function displayShortcut(shortcut, platform) {
  const parts = String(shortcut || "CommandOrControl+Shift+Space").split("+").filter(Boolean);
  return parts.map((part) => {
    if (part === "CommandOrControl") return platform === "darwin" ? "Cmd" : "Ctrl";
    if (part === "Command") return "Cmd";
    if (part === "Control") return "Ctrl";
    if (part === "Alt") return platform === "darwin" ? "Option" : "Alt";
    return part;
  }).join(" + ");
}

function normalizeShortcutKey(event) {
  const key = event.key;
  if (key === " ") return "Space";
  if (key === "Escape") return "Escape";
  if (key === "ArrowUp" || key === "ArrowDown" || key === "ArrowLeft" || key === "ArrowRight") return key;
  if (key === "Backspace" || key === "Delete" || key === "Tab" || key === "Enter") return key;
  if (/^F\d{1,2}$/.test(key)) return key;
  if (typeof key === "string" && key.length === 1) return key.toUpperCase();
  const code = String(event.code || "");
  if (code.startsWith("Key")) return code.slice(3).toUpperCase();
  if (code.startsWith("Digit")) return code.slice(5);
  return "";
}

function eventToShortcut(event, platform) {
  const parts = [];
  const primaryPressed = platform === "darwin" ? event.metaKey : event.ctrlKey;
  if (primaryPressed) {
    parts.push("CommandOrControl");
  } else {
    if (event.metaKey) parts.push("Command");
    if (event.ctrlKey) parts.push("Control");
  }
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");

  const key = normalizeShortcutKey(event);
  if (!key || ["Shift", "Control", "Alt", "Meta", "Command"].includes(key)) return "";
  if (key === "Escape") return "";
  parts.push(key);

  const hasModifier = parts.length > 1;
  return hasModifier ? [...new Set(parts)].join("+") : "";
}

export default function Settings({ wallpaper, onWallpaperChange, fontSize, onFontSizeChange, defaultPrBranch, onDefaultPrBranchChange, coauthorEnabled = false, onCoauthorEnabledChange, appBlur = 0, onAppBlurChange, appOpacity = 100, onAppOpacityChange, developerMode = false, onDeveloperModeChange, sidebarTerminalEnabled = false, onSidebarTerminalEnabledChange, chromeControlsOnHover = false, onChromeControlsOnHoverChange, notificationSound = "glass", onNotificationSoundChange, notificationsMuted = false, onNotificationsMutedChange, quickQShortcut = "CommandOrControl+Shift+Space", quickQShortcutStatus = null, onQuickQShortcutChange, platform = null, locale = "en-US", onLocaleChange, windowControlsVisible = false, onClose }) {
  const s = useFontScale();
  const t = createTranslator(locale);
  const showUpdaterSettings = platform === "win32";
  const [local, setLocal] = useState(() => normalizeWallpaper(wallpaper) ?? { ...DEFAULT_WALLPAPER });
  const [multica, setMultica] = useState(() => loadMulticaState());
  const [multicaServerDraft, setMulticaServerDraft] = useState(() => loadMulticaState().serverUrl || "");
  const {
    rawModels: openCodeModels,
    status: openCodeStatus,
    loading: openCodeLoading,
    refresh: refreshOpenCode,
    saveModel: saveOpenCodeModel,
    removeModel: removeOpenCodeModel,
  } = useOpenCodeModels();
  const [openCodeDraft, setOpenCodeDraft] = useState({
    providerId: "openrouter",
    modelId: "",
    label: "",
    apiKey: "",
    baseURL: "",
    enabled: true,
    thinking: false,
  });
  const [openCodeAdding, setOpenCodeAdding] = useState(false);
  const [openCodeEditingId, setOpenCodeEditingId] = useState("");
  const [openCodeDuplicateSourceId, setOpenCodeDuplicateSourceId] = useState("");
  const [openCodeProviderOpen, setOpenCodeProviderOpen] = useState(false);
  const [openCodeProviderHighlight, setOpenCodeProviderHighlight] = useState(0);
  const [openCodeSaving, setOpenCodeSaving] = useState(false);
  const [openCodeMessage, setOpenCodeMessage] = useState("");
  const openCodeProviderRef = useRef(null);

  // Sync from parent when wallpaper prop changes externally
  useEffect(() => {
    // Local edits should reset when the persisted wallpaper changes outside this panel.
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

  const updateOpenCodeDraft = useCallback((patch) => {
    setOpenCodeDraft((prev) => ({ ...prev, ...patch }));
    setOpenCodeMessage("");
  }, []);

  const handleStartOpenCodeAdd = useCallback(() => {
    setOpenCodeAdding(true);
    setOpenCodeEditingId("");
    setOpenCodeDuplicateSourceId("");
    setOpenCodeProviderOpen(false);
    setOpenCodeProviderHighlight(0);
    setOpenCodeMessage("");
    setOpenCodeDraft((prev) => ({
      ...prev,
      modelId: "",
      label: "",
      apiKey: "",
      baseURL: "",
      enabled: true,
      thinking: false,
    }));
  }, []);

  const handleStartOpenCodeEdit = useCallback((model) => {
    setOpenCodeAdding(true);
    setOpenCodeEditingId(model.id);
    setOpenCodeDuplicateSourceId("");
    setOpenCodeProviderOpen(false);
    setOpenCodeProviderHighlight(0);
    setOpenCodeMessage("");
    setOpenCodeDraft({
      providerId: model.providerId || "openrouter",
      modelId: model.modelId || "",
      label: model.label || "",
      apiKey: "",
      baseURL: model.baseURL || "",
      enabled: model.enabled !== false,
      thinking: Boolean(model.thinking),
    });
  }, []);

  const handleStartOpenCodeDuplicate = useCallback(async (model) => {
    setOpenCodeAdding(true);
    setOpenCodeEditingId("");
    setOpenCodeDuplicateSourceId(model.id);
    setOpenCodeProviderOpen(false);
    setOpenCodeProviderHighlight(0);
    setOpenCodeMessage("");
    const providerId = model.providerId || "openrouter";
    const sourceLabel = model.label || "";
    let providerConfig = { apiKey: "", baseURL: "" };
    try {
      const fetched = await window.api?.opencodeGetProviderConfig?.(providerId);
      if (fetched && typeof fetched === "object") {
        providerConfig = {
          apiKey: typeof fetched.apiKey === "string" ? fetched.apiKey : "",
          baseURL: typeof fetched.baseURL === "string" ? fetched.baseURL : "",
        };
      }
    } catch {
      providerConfig = { apiKey: "", baseURL: "" };
    }
    setOpenCodeDraft({
      providerId,
      modelId: model.modelId || "",
      label: sourceLabel ? `${sourceLabel} (copy)` : "",
      apiKey: model.apiKey || providerConfig.apiKey || "",
      baseURL: model.baseURL || providerConfig.baseURL || "",
      enabled: model.enabled !== false,
      thinking: Boolean(model.thinking),
    });
  }, []);

  const handleCancelOpenCodeAdd = useCallback(() => {
    setOpenCodeAdding(false);
    setOpenCodeEditingId("");
    setOpenCodeDuplicateSourceId("");
    setOpenCodeProviderOpen(false);
    setOpenCodeProviderHighlight(0);
    setOpenCodeMessage("");
    setOpenCodeDraft((prev) => ({
      ...prev,
      modelId: "",
      label: "",
      apiKey: "",
      baseURL: "",
      enabled: true,
      thinking: false,
    }));
  }, []);

  const handleSaveOpenCodeModel = useCallback(async () => {
    const providerId = openCodeDraft.providerId.trim();
    const modelId = openCodeDraft.modelId.trim();
    if (!providerId || !modelId) {
      setOpenCodeMessage(t("settings.opencodeMissingModel"));
      return;
    }
    const nextModelKey = `${providerId}/${modelId}`;
    if (openCodeDuplicateSourceId && openCodeDuplicateSourceId === nextModelKey) {
      setOpenCodeMessage(t("settings.opencodeDuplicateConflict"));
      return;
    }
    setOpenCodeSaving(true);
    setOpenCodeMessage("");
    try {
      const existingModel = openCodeModels.find((model) => (
        model.id === openCodeEditingId || model.id === nextModelKey
      ));
      const nextApiKey = openCodeDraft.apiKey || (openCodeEditingId ? existingModel?.apiKey || "" : "");
      await window.api?.opencodeSaveConfig?.({
        providerId,
        modelId,
        apiKey: nextApiKey,
        baseURL: openCodeDraft.baseURL,
        setDefault: true,
      });
      saveOpenCodeModel({
        providerId,
        modelId,
        label: openCodeDraft.label,
        apiKey: nextApiKey,
        baseURL: openCodeDraft.baseURL,
        enabled: openCodeDraft.enabled !== false,
        thinking: openCodeDraft.thinking,
      });
      if (openCodeEditingId && openCodeEditingId !== nextModelKey) {
        removeOpenCodeModel(openCodeEditingId);
      }
      setOpenCodeDraft((prev) => ({
        ...prev,
        modelId: "",
        label: "",
        apiKey: "",
        baseURL: "",
        enabled: true,
        thinking: false,
      }));
      await refreshOpenCode();
      setOpenCodeAdding(false);
      setOpenCodeEditingId("");
      setOpenCodeDuplicateSourceId("");
      setOpenCodeProviderOpen(false);
      setOpenCodeProviderHighlight(0);
      setOpenCodeMessage(t("settings.opencodeSaved"));
    } catch (error) {
      setOpenCodeMessage(error?.message || t("settings.opencodeSaveFailed"));
    } finally {
      setOpenCodeSaving(false);
    }
  }, [openCodeDraft, openCodeDuplicateSourceId, openCodeEditingId, openCodeModels, refreshOpenCode, removeOpenCodeModel, saveOpenCodeModel, t]);

  const handleRemoveOpenCodeModel = useCallback((modelKey) => {
    removeOpenCodeModel(modelKey);
    setOpenCodeMessage("");
  }, [removeOpenCodeModel]);

  const handleToggleOpenCodeEnabled = useCallback((model) => {
    saveOpenCodeModel({
      ...model,
      enabled: model.enabled === false,
    });
    setOpenCodeMessage("");
  }, [saveOpenCodeModel]);

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

  const inputStyle = {
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
  };

  const compactButtonStyle = (active = true) => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 12px",
    borderRadius: 7,
    background: active ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.06)",
    color: active ? "rgba(255,255,255,0.78)" : "rgba(255,255,255,0.38)",
    fontSize: s(12),
    cursor: active ? "pointer" : "not-allowed",
    transition: "all .2s",
    fontFamily: "system-ui, sans-serif",
  });

  const openCodeProviderOptions = useMemo(() => [
    ...new Set([
      ...(openCodeStatus.supportedProviders || []),
      ...(openCodeStatus.providers || []),
      "openrouter",
    ].map((provider) => String(provider || "").trim()).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b)), [openCodeStatus.providers, openCodeStatus.supportedProviders]);
  const openCodeReady = openCodeStatus.configured || openCodeModels.some((model) => model.apiKey || model.baseURL);

  const openCodeProviderQuery = openCodeDraft.providerId.trim().toLowerCase();
  const filteredOpenCodeProviderOptions = openCodeProviderOptions
    .filter((provider) => !openCodeProviderQuery || provider.toLowerCase().includes(openCodeProviderQuery))
    .slice(0, 12);

  useEffect(() => {
    setOpenCodeProviderHighlight(0);
  }, [openCodeProviderQuery, filteredOpenCodeProviderOptions.length]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!openCodeProviderRef.current?.contains(event.target)) {
        setOpenCodeProviderOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const selectOpenCodeProvider = useCallback((providerId) => {
    updateOpenCodeDraft({ providerId });
    setOpenCodeProviderOpen(false);
    setOpenCodeProviderHighlight(0);
  }, [updateOpenCodeDraft]);

  // Hover state refs for buttons
  const [backHover, setBackHover] = useState(false);
  const [chooseHover, setChooseHover] = useState(false);
  const [removeHover, setRemoveHover] = useState(false);
  const [shortcutRecording, setShortcutRecording] = useState(false);

  const handleShortcutKeyDown = useCallback((event) => {
    if (!shortcutRecording) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") {
      setShortcutRecording(false);
      return;
    }
    const nextShortcut = eventToShortcut(event, platform);
    if (!nextShortcut) return;
    setShortcutRecording(false);
    onQuickQShortcutChange?.(nextShortcut);
  }, [onQuickQShortcutChange, platform, shortcutRecording]);

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
        color: "rgba(255,255,255,0.85)",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {/* Drag region */}
      <div style={{ marginRight: windowControlsVisible ? 126 : 0 }}>
        <WindowDragSpacer />
      </div>

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
              Multica
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

          <div style={{ marginBottom: 28, position: "relative" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                marginBottom: 2,
              }}
            >
              <div
                style={{
                  fontSize: s(13),
                  color: "rgba(255,255,255,0.8)",
                }}
              >
                {t("settings.opencode")}
              </div>
              <button
                type="button"
                onClick={() => refreshOpenCode()}
                disabled={openCodeLoading}
                style={compactButtonStyle(!openCodeLoading)}
                title={t("settings.opencodeRefresh")}
              >
                <RefreshCw size={12} strokeWidth={1.8} />
                {openCodeLoading ? t("settings.checking") : t("settings.refresh")}
              </button>
            </div>
            <div
              style={{
                fontSize: s(11),
                color: "rgba(255,255,255,0.3)",
                marginBottom: 12,
              }}
            >
              {t("settings.opencodeDescription")}
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 12,
                marginBottom: openCodeAdding ? 14 : 12,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: s(12),
                    color: openCodeStatus.installed && openCodeReady
                      ? "rgba(205,255,214,0.88)"
                      : "rgba(255,255,255,0.72)",
                    marginBottom: 4,
                  }}
                >
                  {openCodeStatus.installed
                    ? (openCodeReady ? t("settings.opencodeConfigured") : t("settings.opencodeInstalled"))
                    : t("settings.opencodeNotInstalled")}
                </div>
                {openCodeStatus.version && (
                  <div style={{ fontSize: s(11), color: "rgba(255,255,255,0.42)", marginBottom: 2 }}>
                    {t("settings.version", { value: openCodeStatus.version })}
                  </div>
                )}
                {openCodeStatus.configPath && (
                  <div
                    title={openCodeStatus.configPath}
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: s(10),
                      color: "rgba(255,255,255,0.22)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {openCodeStatus.configPath}
                  </div>
                )}
              </div>
              {(!openCodeAdding || openCodeEditingId) && (
                <button
                  type="button"
                  onClick={handleStartOpenCodeAdd}
                  style={compactButtonStyle(true)}
                >
                  <Plus size={12} strokeWidth={1.8} />
                  {t("settings.opencodeAddModel")}
                </button>
              )}
            </div>

            {openCodeAdding && (
              <div
                role={openCodeEditingId ? "dialog" : undefined}
                aria-label={openCodeEditingId ? t("settings.opencodeEditModel") : undefined}
                style={openCodeEditingId ? {
                  position: "absolute",
                  zIndex: 60,
                  top: 92,
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: "min(620px, calc(100% - 48px))",
                  boxSizing: "border-box",
                  padding: 14,
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(12,14,22,0.72)",
                  backdropFilter: "blur(38px) saturate(1.15)",
                  boxShadow: "0 24px 70px rgba(0,0,0,0.45)",
                  WebkitAppRegion: "no-drag",
                } : undefined}
              >
                <div
                  style={{
                    fontSize: s(11),
                    color: "rgba(255,255,255,0.55)",
                    marginBottom: 8,
                    fontFamily: "'JetBrains Mono', monospace",
                    letterSpacing: ".02em",
                  }}
                >
                  {openCodeEditingId ? t("settings.opencodeEditModel") : t("settings.opencodeAddModel")}
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
                    gap: 8,
                    marginBottom: 8,
                  }}
                >
                  <div
                    ref={openCodeProviderRef}
                    style={{
                      position: "relative",
                      minWidth: 0,
                    }}
                  >
                    <input
                      type="text"
                      role="combobox"
                      aria-expanded={openCodeProviderOpen}
                      aria-autocomplete="list"
                      aria-controls="opencode-provider-options"
                      value={openCodeDraft.providerId}
                      placeholder={t("settings.opencodeProviderPlaceholder")}
                      onChange={(e) => {
                        updateOpenCodeDraft({ providerId: e.target.value });
                        setOpenCodeProviderOpen(true);
                        setOpenCodeProviderHighlight(0);
                      }}
                      onFocus={() => setOpenCodeProviderOpen(true)}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowDown") {
                          e.preventDefault();
                          setOpenCodeProviderOpen(true);
                          setOpenCodeProviderHighlight((idx) => (
                            filteredOpenCodeProviderOptions.length
                              ? Math.min(idx + 1, filteredOpenCodeProviderOptions.length - 1)
                              : 0
                          ));
                        } else if (e.key === "ArrowUp") {
                          e.preventDefault();
                          setOpenCodeProviderHighlight((idx) => Math.max(idx - 1, 0));
                        } else if (e.key === "Enter" && openCodeProviderOpen && filteredOpenCodeProviderOptions[openCodeProviderHighlight]) {
                          e.preventDefault();
                          selectOpenCodeProvider(filteredOpenCodeProviderOptions[openCodeProviderHighlight]);
                        } else if (e.key === "Escape") {
                          setOpenCodeProviderOpen(false);
                        }
                      }}
                      spellCheck={false}
                      style={{ ...inputStyle, paddingRight: 34 }}
                      title={t("settings.opencodeProviderSelect")}
                    />
                    <span
                      aria-hidden="true"
                      style={{
                        position: "absolute",
                        top: 1,
                        right: 1,
                        width: 30,
                        height: 30,
                        borderLeft: "1px solid rgba(255,255,255,0.06)",
                        borderRadius: "0 6px 6px 0",
                        background: "rgba(255,255,255,0.03)",
                        color: "rgba(255,255,255,0.58)",
                        display: "grid",
                        placeItems: "center",
                        pointerEvents: "none",
                      }}
                    >
                      <ChevronDown
                        size={14}
                        strokeWidth={2.2}
                        style={{
                          transform: openCodeProviderOpen ? "rotate(180deg)" : "rotate(0deg)",
                          transition: "transform .16s ease",
                        }}
                      />
                    </span>
                    {openCodeProviderOpen && filteredOpenCodeProviderOptions.length > 0 && (
                      <div
                        id="opencode-provider-options"
                        role="listbox"
                        style={{
                          position: "absolute",
                          top: "calc(100% + 5px)",
                          left: 0,
                          right: 0,
                          zIndex: 80,
                          maxHeight: 196,
                          overflowY: "auto",
                          padding: 4,
                          borderRadius: 8,
                          border: "1px solid rgba(255,255,255,0.1)",
                          background: "linear-gradient(180deg, rgba(20,24,34,0.24), rgba(8,10,16,0.16))",
                          backdropFilter: "blur(42px) saturate(1.35)",
                          WebkitBackdropFilter: "blur(42px) saturate(1.35)",
                          boxShadow: "0 18px 54px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.06)",
                        }}
                      >
                        {filteredOpenCodeProviderOptions.map((provider, index) => {
                          const active = index === openCodeProviderHighlight;
                          const selected = provider === openCodeDraft.providerId.trim();
                          return (
                            <button
                              key={provider}
                              type="button"
                              role="option"
                              aria-selected={selected}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                selectOpenCodeProvider(provider);
                              }}
                              onMouseEnter={() => setOpenCodeProviderHighlight(index)}
                              style={{
                                width: "100%",
                                height: 30,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 8,
                                padding: "0 8px",
                                border: "none",
                                borderRadius: 6,
                                background: active
                                  ? "rgba(255,255,255,0.1)"
                                  : selected
                                    ? "rgba(255,255,255,0.06)"
                                    : "transparent",
                                color: selected ? "rgba(210,232,255,0.95)" : "rgba(255,255,255,0.74)",
                                cursor: "pointer",
                                fontFamily: "'JetBrains Mono', monospace",
                                fontSize: s(11),
                                textAlign: "left",
                                transition: "background .14s ease, color .14s ease",
                              }}
                            >
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {provider}
                              </span>
                              {selected && <Check size={12} strokeWidth={2.4} style={{ flex: "0 0 auto" }} />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <input
                    type="text"
                    value={openCodeDraft.modelId}
                    placeholder={t("settings.opencodeModelPlaceholder")}
                    onChange={(e) => updateOpenCodeDraft({ modelId: e.target.value })}
                    spellCheck={false}
                    style={inputStyle}
                  />
                  <input
                    type="text"
                    value={openCodeDraft.label}
                    placeholder={t("settings.opencodeLabelPlaceholder")}
                    onChange={(e) => updateOpenCodeDraft({ label: e.target.value })}
                    spellCheck={false}
                    style={{ ...inputStyle, gridColumn: "1 / -1" }}
                  />
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
                    gap: 8,
                    marginBottom: 10,
                  }}
                >
                  <input
                    type="password"
                    value={openCodeDraft.apiKey}
                    placeholder={
                      openCodeDuplicateSourceId
                        ? t("settings.opencodeDuplicateApiKeyPlaceholder")
                        : openCodeEditingId
                          ? t("settings.opencodeApiKeyEditPlaceholder")
                          : t("settings.opencodeApiKeyPlaceholder")
                    }
                    onChange={(e) => updateOpenCodeDraft({ apiKey: e.target.value })}
                    spellCheck={false}
                    style={inputStyle}
                  />
                  <input
                    type="text"
                    value={openCodeDraft.baseURL}
                    placeholder={t("settings.opencodeBaseUrlPlaceholder")}
                    onChange={(e) => updateOpenCodeDraft({ baseURL: e.target.value })}
                    spellCheck={false}
                    style={inputStyle}
                  />
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: "8px 10px",
                    marginBottom: 10,
                    borderRadius: 7,
                    border: "1px solid rgba(255,255,255,0.06)",
                    background: "rgba(255,255,255,0.025)",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: s(12),
                        color: "rgba(255,255,255,0.76)",
                        marginBottom: 2,
                      }}
                    >
                      {t("settings.opencodeThinking")}
                    </div>
                    <div
                      style={{
                        fontSize: s(10),
                        color: "rgba(255,255,255,0.3)",
                        lineHeight: 1.35,
                      }}
                    >
                      {t("settings.opencodeThinkingDescription")}
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={openCodeDraft.thinking}
                    aria-label={t("settings.opencodeThinking")}
                    onClick={() => updateOpenCodeDraft({ thinking: !openCodeDraft.thinking })}
                    style={{
                      flexShrink: 0,
                      width: 38,
                      height: 22,
                      borderRadius: 999,
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: openCodeDraft.thinking ? "rgba(180,220,255,0.35)" : "rgba(255,255,255,0.06)",
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
                        left: openCodeDraft.thinking ? 18 : 2,
                        width: 16,
                        height: 16,
                        borderRadius: "50%",
                        background: "rgba(255,255,255,0.9)",
                        transition: "left 120ms ease",
                      }}
                    />
                  </button>
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                    alignItems: "center",
                    justifyContent: "flex-start",
                    marginBottom: 12,
                  }}
                >
                  <button
                    type="button"
                    onClick={handleCancelOpenCodeAdd}
                    disabled={openCodeSaving}
                    style={compactButtonStyle(!openCodeSaving)}
                  >
                    {t("settings.opencodeCancelAdd")}
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveOpenCodeModel}
                    disabled={openCodeSaving || !openCodeDraft.providerId.trim() || !openCodeDraft.modelId.trim()}
                    style={compactButtonStyle(!openCodeSaving && !!openCodeDraft.providerId.trim() && !!openCodeDraft.modelId.trim())}
                  >
                    <Check size={12} strokeWidth={1.8} />
                    {openCodeSaving
                      ? t("settings.saving")
                      : openCodeEditingId
                        ? t("settings.opencodeUpdateModel")
                        : openCodeDuplicateSourceId
                          ? t("settings.opencodeDuplicateSubmit")
                          : t("settings.opencodeSaveModel")}
                  </button>
                </div>
              </div>
            )}

            {openCodeMessage && (
              <div
                style={{
                  fontSize: s(11),
                  color: openCodeMessage === t("settings.opencodeSaved")
                    ? "rgba(205,255,214,0.74)"
                    : "rgba(255,210,160,0.74)",
                  marginBottom: 12,
                }}
              >
                {openCodeMessage}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {openCodeModels.length === 0 ? (
                <div style={{ fontSize: s(11), color: "rgba(255,255,255,0.28)" }}>
                  {t("settings.opencodeNoModels")}
                </div>
              ) : openCodeModels.map((model) => (
                <div
                  key={model.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    padding: "7px 8px 7px 10px",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 7,
                    background: "rgba(255,255,255,0.025)",
                    opacity: model.enabled === false ? 0.55 : 1,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        minWidth: 0,
                      }}
                    >
                      <span
                        style={{
                          fontSize: s(12),
                          color: "rgba(255,255,255,0.76)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {model.label || `${model.providerId}/${model.modelId}`}
                      </span>
                      {model.thinking && (
                        <span
                          style={{
                            flexShrink: 0,
                            padding: "2px 5px",
                            borderRadius: 5,
                            border: "1px solid rgba(180,220,255,0.18)",
                            background: "rgba(180,220,255,0.08)",
                            color: "rgba(210,230,255,0.62)",
                            fontSize: s(9),
                            fontFamily: "'JetBrains Mono', monospace",
                            lineHeight: 1,
                          }}
                        >
                          {t("settings.opencodeThinkingBadge")}
                        </span>
                      )}
                      {model.enabled === false && (
                        <span
                          style={{
                            flexShrink: 0,
                            padding: "2px 5px",
                            borderRadius: 5,
                            border: "1px solid rgba(255,255,255,0.10)",
                            background: "rgba(255,255,255,0.04)",
                            color: "rgba(255,255,255,0.42)",
                            fontSize: s(9),
                            fontFamily: "'JetBrains Mono', monospace",
                            lineHeight: 1,
                          }}
                        >
                          {t("settings.opencodeDisabledBadge")}
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: s(10),
                        color: "rgba(255,255,255,0.28)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {model.providerId}/{model.modelId}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={model.enabled !== false}
                      aria-label={model.enabled !== false
                        ? t("settings.opencodeDisableModel")
                        : t("settings.opencodeEnableModel")}
                      onClick={() => handleToggleOpenCodeEnabled(model)}
                      style={{
                        width: 34,
                        height: 20,
                        borderRadius: 999,
                        border: "1px solid rgba(255,255,255,0.12)",
                        background: model.enabled !== false ? "rgba(180,220,255,0.35)" : "rgba(255,255,255,0.06)",
                        position: "relative",
                        cursor: "pointer",
                        padding: 0,
                        transition: "background 120ms ease",
                      }}
                      title={model.enabled !== false
                        ? t("settings.opencodeDisableModel")
                        : t("settings.opencodeEnableModel")}
                    >
                      <span
                        style={{
                          position: "absolute",
                          top: 2,
                          left: model.enabled !== false ? 16 : 2,
                          width: 14,
                          height: 14,
                          borderRadius: "50%",
                          background: "rgba(255,255,255,0.9)",
                          transition: "left 120ms ease",
                        }}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStartOpenCodeEdit(model)}
                      aria-label={t("settings.opencodeEditModel")}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 28,
                        height: 28,
                        borderRadius: 7,
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.06)",
                        color: "rgba(255,255,255,0.45)",
                        cursor: "pointer",
                      }}
                      title={t("settings.opencodeEditModel")}
                    >
                      <Pencil size={13} strokeWidth={1.7} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStartOpenCodeDuplicate(model)}
                      aria-label={t("settings.opencodeDuplicateModel")}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 28,
                        height: 28,
                        borderRadius: 7,
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.06)",
                        color: "rgba(255,255,255,0.45)",
                        cursor: "pointer",
                      }}
                      title={t("settings.opencodeDuplicateModel")}
                    >
                      <Copy size={13} strokeWidth={1.7} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveOpenCodeModel(model.id)}
                      aria-label={t("settings.opencodeRemoveModel")}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 28,
                        height: 28,
                        borderRadius: 7,
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.06)",
                        color: "rgba(255,255,255,0.45)",
                        cursor: "pointer",
                      }}
                      title={t("settings.opencodeRemoveModel")}
                    >
                      <Trash2 size={13} strokeWidth={1.7} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 28 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                marginBottom: 2,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: s(13),
                    color: "rgba(255,255,255,0.8)",
                    marginBottom: 2,
                  }}
                >
                  {t("settings.quickQ")}
                </div>
                <div
                  style={{
                    fontSize: s(11),
                    color: "rgba(255,255,255,0.3)",
                    lineHeight: 1.35,
                  }}
                >
                  {t("settings.quickQDescription")}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShortcutRecording(true)}
                onKeyDown={handleShortcutKeyDown}
                onBlur={() => setShortcutRecording(false)}
                style={{
                  minWidth: 176,
                  height: 34,
                  padding: "0 10px",
                  borderRadius: 7,
                  border: shortcutRecording
                    ? "1px solid rgba(205,235,255,0.36)"
                    : "1px solid rgba(255,255,255,0.08)",
                  background: shortcutRecording
                    ? "rgba(205,235,255,0.10)"
                    : "rgba(255,255,255,0.04)",
                  color: shortcutRecording ? "rgba(235,248,255,0.9)" : "rgba(255,255,255,0.76)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: s(11),
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                <Keyboard size={13} strokeWidth={1.7} />
                {shortcutRecording
                  ? t("settings.quickQPressShortcut")
                  : displayShortcut(quickQShortcut, platform)}
              </button>
            </div>
            <div
              style={{
                fontSize: s(10),
                color: quickQShortcutStatus?.registered === false
                  ? "rgba(255,190,150,0.72)"
                  : "rgba(255,255,255,0.26)",
                marginTop: 8,
                minHeight: 14,
              }}
            >
              {quickQShortcutStatus?.registered === false
                ? (quickQShortcutStatus.error || t("settings.quickQShortcutFailed"))
                : t("settings.quickQShortcutRegistered")}
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
