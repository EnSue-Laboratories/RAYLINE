import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { ArrowLeft, Check, ChevronDown, Copy, Image, Pencil, Plus, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { useFontScale } from "../contexts/FontSizeContext";
import { useTheme } from "../contexts/ThemeContext.jsx";
import { DEFAULT_APPEARANCE, FONT_OPTIONS, LOGO_RED, isValidHexColor, normalizeAppearance } from "../utils/appearance";
import { createTranslator } from "../i18n";
import { getPaneSurfaceStyle } from "../utils/paneSurface";
import { DEFAULT_WALLPAPER, normalizeWallpaper } from "../utils/wallpaper";
import { CHIME_SOUNDS, playChime } from "../utils/chime";
import { loadMulticaState, normalizeMulticaServerUrl, saveMulticaState } from "../multica/store";
import { useOpenCodeModels } from "../data/openCodeModels.jsx";
import { useProviderUpstreams } from "../data/providerUpstreams.jsx";
import WindowDragSpacer from "./WindowDragSpacer";

const EMPTY_UPSTREAM_CONFIG = {
  enabled: false,
  baseURL: "",
  apiKey: "",
  modelListText: "",
};

function normalizeUpstreamDrafts(configs = {}) {
  return {
    claude: { ...EMPTY_UPSTREAM_CONFIG, ...(configs.claude || {}) },
    codex: { ...EMPTY_UPSTREAM_CONFIG, ...(configs.codex || {}) },
  };
}

export default function Settings({ wallpaper, onWallpaperChange, appearance, onAppearanceChange, fontSize, onFontSizeChange, defaultPrBranch, onDefaultPrBranchChange, coauthorEnabled = false, onCoauthorEnabledChange, appBlur = 0, onAppBlurChange, appOpacity = 100, onAppOpacityChange, developerMode = false, onDeveloperModeChange, sidebarTerminalEnabled = false, onSidebarTerminalEnabledChange, chromeControlsOnHover = false, onChromeControlsOnHoverChange, notificationSound = "glass", onNotificationSoundChange, notificationsMuted = false, onNotificationsMutedChange, platform = null, locale = "en-US", onLocaleChange, windowControlsVisible = false, onClose }) {
  const s = useFontScale();
  const { mode, resolved, setMode } = useTheme();
  const t = createTranslator(locale);
  const [editingTheme, setEditingTheme] = useState(() => resolved === "light" ? "light" : "dark");
  const [themeManagerCollapsed, setThemeManagerCollapsed] = useState(true);
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
  const {
    configsByProvider: upstreamConfigsByProvider,
    saveConfig: saveUpstreamConfig,
    clearConfig: clearUpstreamConfig,
  } = useProviderUpstreams();
  const [upstreamDrafts, setUpstreamDrafts] = useState(() => normalizeUpstreamDrafts(upstreamConfigsByProvider));
  const [upstreamDirtyProviders, setUpstreamDirtyProviders] = useState({});
  const [upstreamMessages, setUpstreamMessages] = useState({});
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

  useEffect(() => {
    const normalized = normalizeUpstreamDrafts(upstreamConfigsByProvider);
    setUpstreamDrafts((prev) => ({
      claude: upstreamDirtyProviders.claude ? (prev.claude || normalized.claude) : normalized.claude,
      codex: upstreamDirtyProviders.codex ? (prev.codex || normalized.codex) : normalized.codex,
    }));
  }, [upstreamConfigsByProvider, upstreamDirtyProviders]);

  const updateUpstreamDraft = useCallback((provider, patch) => {
    setUpstreamDrafts((prev) => ({
      ...prev,
      [provider]: {
        ...(prev[provider] || EMPTY_UPSTREAM_CONFIG),
        ...patch,
      },
    }));
    setUpstreamDirtyProviders((prev) => ({ ...prev, [provider]: true }));
    setUpstreamMessages((prev) => ({ ...prev, [provider]: "" }));
  }, []);

  const handleSaveUpstreamConfig = useCallback((provider) => {
    saveUpstreamConfig(provider, upstreamDrafts[provider] || EMPTY_UPSTREAM_CONFIG);
    setUpstreamDirtyProviders((prev) => ({ ...prev, [provider]: false }));
    setUpstreamMessages((prev) => ({ ...prev, [provider]: t("settings.upstreamSaved") }));
  }, [saveUpstreamConfig, t, upstreamDrafts]);

  const handleToggleUpstreamConfig = useCallback((provider, enabled) => {
    const nextDraft = {
      ...(upstreamDrafts[provider] || EMPTY_UPSTREAM_CONFIG),
      enabled,
    };
    setUpstreamDrafts((prev) => ({
      ...prev,
      [provider]: nextDraft,
    }));
    saveUpstreamConfig(provider, nextDraft);
    setUpstreamDirtyProviders((prev) => ({ ...prev, [provider]: false }));
    setUpstreamMessages((prev) => ({
      ...prev,
      [provider]: enabled ? t("settings.upstreamEnabledSaved") : t("settings.upstreamDisabledSaved"),
    }));
  }, [saveUpstreamConfig, t, upstreamDrafts]);

  const handleClearUpstreamConfig = useCallback((provider) => {
    clearUpstreamConfig(provider);
    setUpstreamDrafts((prev) => ({
      ...prev,
      [provider]: { ...EMPTY_UPSTREAM_CONFIG },
    }));
    setUpstreamDirtyProviders((prev) => ({ ...prev, [provider]: false }));
    setUpstreamMessages((prev) => ({ ...prev, [provider]: t("settings.upstreamCleared") }));
  }, [clearUpstreamConfig, t]);

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
  const themeOptions = [
    { value: "auto", label: t("settings.themeAuto") },
    { value: "light", label: t("settings.themeLight") },
    { value: "dark", label: t("settings.themeDark") },
  ];
  const normalizedAppearance = normalizeAppearance(appearance);
  const editingProfile = normalizedAppearance.profiles[editingTheme];
  const paletteFields = [
    { key: "accent", label: t("settings.appearanceAccent") },
    { key: "background", label: t("settings.appearanceBackground") },
    { key: "pane", label: t("settings.appearancePane") },
    { key: "surface", label: t("settings.appearanceSurface") },
    { key: "surfaceStrong", label: t("settings.appearanceSurfaceStrong") },
    { key: "border", label: t("settings.appearanceBorder") },
    { key: "text", label: t("settings.appearanceText") },
    { key: "success", label: t("settings.appearanceSuccess") },
    { key: "danger", label: t("settings.appearanceDanger") },
    { key: "warning", label: t("settings.appearanceWarning") },
  ];
  const typographyFields = [
    { key: "uiFont", label: t("settings.appearanceUiFont"), options: FONT_OPTIONS.ui },
    { key: "contentFont", label: t("settings.appearanceContentFont"), options: FONT_OPTIONS.content },
    { key: "monoFont", label: t("settings.appearanceMonoFont"), options: FONT_OPTIONS.mono },
  ];

  const updateAppearanceProfile = useCallback((section, key, value) => {
    const current = normalizeAppearance(appearance);
    const currentProfile = current.profiles[editingTheme];
    const nextProfile = {
      ...currentProfile,
      [section]: {
        ...currentProfile[section],
        [key]: value,
      },
    };
    onAppearanceChange?.({
      ...current,
      profiles: {
        ...current.profiles,
        [editingTheme]: nextProfile,
      },
    });
  }, [appearance, editingTheme, onAppearanceChange]);

  const resetAppearanceProfile = useCallback(() => {
    const current = normalizeAppearance(appearance);
    onAppearanceChange?.({
      ...current,
      profiles: {
        ...current.profiles,
        [editingTheme]: DEFAULT_APPEARANCE.profiles[editingTheme],
      },
    });
  }, [appearance, editingTheme, onAppearanceChange]);

  const resetAllAppearance = useCallback(() => {
    onAppearanceChange?.(DEFAULT_APPEARANCE);
  }, [onAppearanceChange]);

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

  const inputStyle = {
    width: "100%",
    boxSizing: "border-box",
    height: 32,
    padding: "0 10px",
    background: "var(--control-bg)",
    border: "1px solid var(--control-border)",
    borderRadius: 7,
    color: "var(--text-primary)",
    fontFamily: "var(--font-mono)",
    fontSize: s(12),
    outline: "none",
  };

  const textareaStyle = {
    ...inputStyle,
    minHeight: 84,
    height: "auto",
    padding: "8px 10px",
    resize: "vertical",
    lineHeight: 1.45,
  };

  const compactButtonStyle = (active = true) => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 12px",
    borderRadius: 7,
    background: active ? "var(--hover-overlay)" : "var(--control-bg)",
    border: "1px solid var(--control-border)",
    color: active
      ? "color-mix(in srgb, var(--text-primary) 78%, transparent)"
      : "color-mix(in srgb, var(--text-primary) 38%, transparent)",
    fontSize: s(12),
    cursor: active ? "pointer" : "not-allowed",
    transition: "all .2s",
    fontFamily: "var(--font-ui)",
  });

  const switchStyle = (enabled) => ({
    position: "relative",
    flexShrink: 0,
    width: 42,
    height: 23,
    padding: 2,
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 999,
    WebkitAppearance: "none",
    appearance: "none",
    background: enabled ? "rgba(210,230,255,0.24)" : "rgba(255,255,255,0.045)",
    boxShadow: enabled ? "inset 0 0 0 1px rgba(210,230,255,0.12)" : "none",
    cursor: "pointer",
    transition: "all .2s",
  });

  const switchKnobStyle = (enabled) => ({
    display: "block",
    width: 17,
    height: 17,
    borderRadius: "50%",
    background: enabled ? "rgba(245,248,255,0.95)" : "rgba(255,255,255,0.38)",
    transform: enabled ? "translateX(17px)" : "translateX(0)",
    transition: "all .2s",
    boxShadow: enabled ? "0 2px 10px rgba(190,220,255,0.24)" : "0 2px 8px rgba(0,0,0,0.18)",
  });

  const openCodeProviderOptions = useMemo(() => [
    ...new Set([
      ...(openCodeStatus.supportedProviders || []),
      ...(openCodeStatus.providers || []),
      "openrouter",
    ].map((provider) => String(provider || "").trim()).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b)), [openCodeStatus.providers, openCodeStatus.supportedProviders]);
  const openCodeReady = openCodeStatus.configured || openCodeModels.some((model) => model.apiKey || model.baseURL);
  const upstreamProviderDefs = [
    { id: "claude", label: t("settings.upstreamClaude") },
    { id: "codex", label: t("settings.upstreamCodex") },
  ];

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
        fontFamily: "var(--font-ui)",
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
              ? "var(--control-bg)"
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
              fontFamily: "var(--font-mono)",
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

          <SettingBlock style={{ marginBottom: 24 }}>
            <div style={{ marginBottom: 14 }}>
              <div
                style={{
                  fontSize: s(13),
                  color: "color-mix(in srgb, var(--text-primary) 87%, transparent)",
                  marginBottom: 2,
                }}
              >
                {t("settings.theme")}
              </div>
              <div
                style={{
                  fontSize: s(11),
                  color: "color-mix(in srgb, var(--text-primary) 33%, transparent)",
                  marginBottom: 10,
                }}
              >
                {t("settings.themeDescription")}
              </div>
              <SegmentedControl
                options={themeOptions}
                value={mode}
                onChange={setMode}
                s={s}
              />
            </div>

            <div style={{ marginBottom: themeManagerCollapsed ? 0 : 14 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  marginBottom: themeManagerCollapsed ? 0 : 10,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: s(13),
                      color: "color-mix(in srgb, var(--text-primary) 87%, transparent)",
                      marginBottom: 2,
                    }}
                  >
                    {t("settings.appearanceProfile")}
                  </div>
                  <div
                    style={{
                      fontSize: s(11),
                      color: "color-mix(in srgb, var(--text-primary) 33%, transparent)",
                    }}
                  >
                    {t("settings.appearanceProfileDescription")}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  {!themeManagerCollapsed && (
                    <>
                      <button
                        type="button"
                        onClick={resetAppearanceProfile}
                        title={t("settings.resetProfile")}
                        aria-label={t("settings.resetProfile")}
                        style={iconActionStyle}
                      >
                        <RotateCcw size={12} strokeWidth={1.8} />
                      </button>
                      <button
                        type="button"
                        onClick={resetAllAppearance}
                        style={smallActionStyle(s)}
                      >
                        {t("settings.resetAll")}
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => setThemeManagerCollapsed((value) => !value)}
                    title={themeManagerCollapsed ? t("settings.expandThemeManagement") : t("settings.collapseThemeManagement")}
                    aria-label={themeManagerCollapsed ? t("settings.expandThemeManagement") : t("settings.collapseThemeManagement")}
                    aria-expanded={!themeManagerCollapsed}
                    style={iconActionStyle}
                  >
                    <ChevronDown
                      size={13}
                      strokeWidth={2}
                      style={{
                        transform: themeManagerCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
                        transition: "transform 140ms ease",
                      }}
                    />
                  </button>
                </div>
              </div>
              {!themeManagerCollapsed && (
                <SegmentedControl
                  options={[
                    { value: "light", label: t("settings.configureLight") },
                    { value: "dark", label: t("settings.configureDark") },
                  ]}
                  value={editingTheme}
                  onChange={setEditingTheme}
                  s={s}
                />
              )}
            </div>

            {!themeManagerCollapsed && (
              <>
                <AppearancePreview
                  profile={editingProfile}
                  labels={{
                    accent: t("settings.appearanceAccent"),
                    surface: t("settings.appearanceSurface"),
                    text: t("settings.appearanceText"),
                    success: t("settings.appearanceSuccess"),
                    danger: t("settings.appearanceDanger"),
                    warning: t("settings.appearanceWarning"),
                    logo: t("settings.appearanceLogoRed"),
                    guideTitle: t("settings.appearanceGuideTitle"),
                    logoUse: t("settings.appearanceGuideLogoUse"),
                    accentUse: t("settings.appearanceGuideAccentUse"),
                    successUse: t("settings.appearanceGuideSuccessUse"),
                    dangerUse: t("settings.appearanceGuideDangerUse"),
                    warningUse: t("settings.appearanceGuideWarningUse"),
                    surfaceTextUse: t("settings.appearanceGuideSurfaceTextUse"),
                  }}
                  s={s}
                />

                <div style={{ overflow: "hidden", borderRadius: 8, border: "1px solid var(--control-border)" }}>
                  {paletteFields.map((field) => (
                    <ColorField
                      key={field.key}
                      label={field.label}
                      value={editingProfile.palette[field.key]}
                      onChange={(value) => updateAppearanceProfile("palette", field.key, value)}
                      s={s}
                    />
                  ))}
                </div>

                <div style={{ marginTop: 14, overflow: "hidden", borderRadius: 8, border: "1px solid var(--control-border)" }}>
                  {typographyFields.map((field) => (
                    <SelectField
                      key={field.key}
                      label={field.label}
                      value={editingProfile.typography[field.key]}
                      options={field.options}
                      onChange={(value) => updateAppearanceProfile("typography", field.key, value)}
                      s={s}
                    />
                  ))}
                </div>
              </>
            )}
          </SettingBlock>

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
                  fontFamily: "var(--font-ui)",
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
                  background: chromeControlsOnHover ? "color-mix(in srgb, var(--accent) 35%, transparent)" : "var(--control-bg)",
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
                    fontFamily: "var(--font-ui)",
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
                        ? "var(--control-bg)"
                        : "var(--control-bg)",
                      border: "1px solid var(--control-border)",
                      color: "color-mix(in srgb, var(--text-primary) 49%, transparent)",
                      fontSize: s(12),
                      cursor: "pointer",
                      transition: "all .2s",
                      fontFamily: "var(--font-ui)",
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
              fontFamily: "var(--font-mono)",
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
              fontFamily: "var(--font-mono)",
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
              {t("settings.upstreams")}
            </div>
            <div
              style={{
                fontSize: s(11),
                color: "rgba(255,255,255,0.3)",
                marginBottom: 12,
              }}
            >
              {t("settings.upstreamsDescription")}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {upstreamProviderDefs.map((def) => {
                const draft = upstreamDrafts[def.id] || EMPTY_UPSTREAM_CONFIG;
                const configured = Boolean(draft.baseURL.trim() || draft.apiKey.trim() || draft.modelListText.trim());
                const enabled = Boolean(draft.enabled);
                const activeOverride = enabled && configured;
                const statusText = activeOverride
                  ? t("settings.upstreamConfigured")
                  : enabled
                    ? t("settings.upstreamEnabledNoConfig")
                    : configured
                      ? t("settings.upstreamSavedDisabled")
                      : t("settings.upstreamUsingDefault");
                const providerMessage = upstreamMessages[def.id] || "";
                return (
                  <div
                    key={def.id}
                    style={{
                      padding: 12,
                      border: "1px solid rgba(255,255,255,0.06)",
                      borderRadius: 8,
                      background: enabled ? "rgba(255,255,255,0.035)" : "rgba(255,255,255,0.02)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 10,
                        marginBottom: enabled ? 10 : 0,
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: s(12),
                            color: "rgba(255,255,255,0.76)",
                          }}
                        >
                          {t("settings.upstreamOverrideTitle", { provider: def.label })}
                        </div>
                        <div
                          style={{
                            fontSize: s(10),
                            color: "rgba(255,255,255,0.28)",
                            marginTop: 2,
                          }}
                        >
                          {statusText}
                        </div>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "flex-end",
                          gap: 8,
                          flexShrink: 0,
                        }}
                      >
                        {configured && (
                          <span
                            style={{
                              flexShrink: 0,
                              padding: "2px 5px",
                              borderRadius: 5,
                              border: activeOverride ? "1px solid rgba(180,220,255,0.18)" : "1px solid rgba(255,255,255,0.08)",
                              background: activeOverride ? "rgba(180,220,255,0.08)" : "rgba(255,255,255,0.035)",
                              color: activeOverride ? "rgba(210,230,255,0.72)" : "rgba(255,255,255,0.38)",
                              fontSize: s(9),
                              fontFamily: "'JetBrains Mono', monospace",
                              lineHeight: 1,
                            }}
                          >
                            {activeOverride ? t("settings.upstreamOverrideBadge") : t("settings.upstreamDisabledBadge")}
                          </span>
                        )}
                        <button
                          type="button"
                          role="switch"
                          aria-checked={enabled}
                          aria-label={t("settings.upstreamEnableLabel", { provider: def.label })}
                          onClick={() => handleToggleUpstreamConfig(def.id, !enabled)}
                          style={switchStyle(enabled)}
                        >
                          <span style={switchKnobStyle(enabled)} />
                        </button>
                      </div>
                    </div>

                    {enabled && (
                      <>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                            gap: 8,
                            marginBottom: 8,
                          }}
                        >
                          <input
                            type="text"
                            value={draft.baseURL}
                            placeholder={t("settings.upstreamBaseUrlPlaceholder")}
                            onChange={(e) => updateUpstreamDraft(def.id, { baseURL: e.target.value })}
                            spellCheck={false}
                            style={inputStyle}
                          />
                          <input
                            type="password"
                            value={draft.apiKey}
                            placeholder={t("settings.upstreamApiKeyPlaceholder")}
                            onChange={(e) => updateUpstreamDraft(def.id, { apiKey: e.target.value })}
                            spellCheck={false}
                            style={inputStyle}
                          />
                        </div>
                        <textarea
                          value={draft.modelListText}
                          placeholder={t("settings.upstreamModelListPlaceholder")}
                          onChange={(e) => updateUpstreamDraft(def.id, { modelListText: e.target.value })}
                          spellCheck={false}
                          style={textareaStyle}
                        />
                        <div
                          style={{
                            fontSize: s(10),
                            color: "rgba(255,255,255,0.28)",
                            marginTop: 6,
                            marginBottom: 10,
                          }}
                        >
                          {t("settings.upstreamModelListHint")}
                        </div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            onClick={() => handleClearUpstreamConfig(def.id)}
                            disabled={!configured}
                            style={compactButtonStyle(configured)}
                          >
                            {t("settings.upstreamClear")}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveUpstreamConfig(def.id)}
                            style={compactButtonStyle(true)}
                          >
                            <Check size={12} strokeWidth={1.8} />
                            {t("settings.upstreamSave")}
                          </button>
                        </div>
                      </>
                    )}
                    {providerMessage && (
                      <div
                        style={{
                          fontSize: s(11),
                          color: "rgba(205,255,214,0.74)",
                          marginTop: enabled ? 10 : 8,
                        }}
                      >
                        {providerMessage}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
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
                  fontFamily: "var(--font-mono)",
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
                  fontFamily: "var(--font-ui)",
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
                  fontFamily: "var(--font-ui)",
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
                    fontFamily: "var(--font-ui)",
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
                  color: "color-mix(in srgb, var(--text-primary) 87%, transparent)",
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
                color: "color-mix(in srgb, var(--text-primary) 30%, transparent)",
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
                      : "color-mix(in srgb, var(--text-primary) 72%, transparent)",
                    marginBottom: 4,
                  }}
                >
                  {openCodeStatus.installed
                    ? (openCodeReady ? t("settings.opencodeConfigured") : t("settings.opencodeInstalled"))
                    : t("settings.opencodeNotInstalled")}
                </div>
                {openCodeStatus.version && (
                  <div style={{ fontSize: s(11), color: "color-mix(in srgb, var(--text-primary) 42%, transparent)", marginBottom: 2 }}>
                    {t("settings.version", { value: openCodeStatus.version })}
                  </div>
                )}
                {openCodeStatus.configPath && (
                  <div
                    title={openCodeStatus.configPath}
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: s(10),
                      color: "color-mix(in srgb, var(--text-primary) 22%, transparent)",
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
                  border: "1px solid color-mix(in srgb, var(--text-primary) 8%, transparent)",
                  background: "rgba(12,14,22,0.72)",
                  backdropFilter: "blur(38px) saturate(1.15)",
                  boxShadow: "0 24px 70px rgba(0,0,0,0.45)",
                  WebkitAppRegion: "no-drag",
                } : undefined}
              >
                <div
                  style={{
                    fontSize: s(11),
                    color: "color-mix(in srgb, var(--text-primary) 55%, transparent)",
                    marginBottom: 8,
                    fontFamily: "var(--font-mono)",
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
                        borderLeft: "1px solid color-mix(in srgb, var(--text-primary) 6%, transparent)",
                        borderRadius: "0 6px 6px 0",
                        background: "color-mix(in srgb, var(--text-primary) 3%, transparent)",
                        color: "color-mix(in srgb, var(--text-primary) 58%, transparent)",
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
                          border: "1px solid color-mix(in srgb, var(--text-primary) 10%, transparent)",
                          background: "linear-gradient(180deg, rgba(20,24,34,0.24), rgba(8,10,16,0.16))",
                          backdropFilter: "blur(42px) saturate(1.35)",
                          WebkitBackdropFilter: "blur(42px) saturate(1.35)",
                          boxShadow: "0 18px 54px rgba(0,0,0,0.18), inset 0 1px 0 color-mix(in srgb, var(--text-primary) 6%, transparent)",
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
                                  ? "color-mix(in srgb, var(--text-primary) 10%, transparent)"
                                  : selected
                                    ? "color-mix(in srgb, var(--text-primary) 6%, transparent)"
                                    : "transparent",
                                color: selected ? "var(--accent)" : "color-mix(in srgb, var(--text-primary) 74%, transparent)",
                                cursor: "pointer",
                                fontFamily: "var(--font-mono)",
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
                    border: "1px solid color-mix(in srgb, var(--text-primary) 6%, transparent)",
                    background: "color-mix(in srgb, var(--text-primary) 2.5%, transparent)",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: s(12),
                        color: "color-mix(in srgb, var(--text-primary) 76%, transparent)",
                        marginBottom: 2,
                      }}
                    >
                      {t("settings.opencodeThinking")}
                    </div>
                    <div
                      style={{
                        fontSize: s(10),
                        color: "color-mix(in srgb, var(--text-primary) 30%, transparent)",
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
                      border: "1px solid color-mix(in srgb, var(--text-primary) 12%, transparent)",
                      background: openCodeDraft.thinking ? "color-mix(in srgb, var(--accent) 35%, transparent)" : "color-mix(in srgb, var(--text-primary) 6%, transparent)",
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
                        background: "color-mix(in srgb, var(--text-primary) 90%, transparent)",
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
                <div style={{ fontSize: s(11), color: "color-mix(in srgb, var(--text-primary) 28%, transparent)" }}>
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
                    border: "1px solid color-mix(in srgb, var(--text-primary) 6%, transparent)",
                    borderRadius: 7,
                    background: "color-mix(in srgb, var(--text-primary) 2.5%, transparent)",
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
                          color: "color-mix(in srgb, var(--text-primary) 76%, transparent)",
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
                            border: "1px solid color-mix(in srgb, var(--accent) 18%, transparent)",
                            background: "color-mix(in srgb, var(--accent) 8%, transparent)",
                            color: "color-mix(in srgb, var(--accent) 62%, transparent)",
                            fontSize: s(9),
                            fontFamily: "var(--font-mono)",
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
                            border: "1px solid color-mix(in srgb, var(--text-primary) 10%, transparent)",
                            background: "color-mix(in srgb, var(--text-primary) 4%, transparent)",
                            color: "color-mix(in srgb, var(--text-primary) 42%, transparent)",
                            fontSize: s(9),
                            fontFamily: "var(--font-mono)",
                            lineHeight: 1,
                          }}
                        >
                          {t("settings.opencodeDisabledBadge")}
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: s(10),
                        color: "color-mix(in srgb, var(--text-primary) 28%, transparent)",
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
                        border: "1px solid color-mix(in srgb, var(--text-primary) 12%, transparent)",
                        background: model.enabled !== false ? "color-mix(in srgb, var(--accent) 35%, transparent)" : "color-mix(in srgb, var(--text-primary) 6%, transparent)",
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
                          background: "color-mix(in srgb, var(--text-primary) 90%, transparent)",
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
                        background: "color-mix(in srgb, var(--text-primary) 3%, transparent)",
                        border: "1px solid color-mix(in srgb, var(--text-primary) 6%, transparent)",
                        color: "color-mix(in srgb, var(--text-primary) 45%, transparent)",
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
                        background: "color-mix(in srgb, var(--text-primary) 3%, transparent)",
                        border: "1px solid color-mix(in srgb, var(--text-primary) 6%, transparent)",
                        color: "color-mix(in srgb, var(--text-primary) 45%, transparent)",
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
                        background: "color-mix(in srgb, var(--text-primary) 3%, transparent)",
                        border: "1px solid color-mix(in srgb, var(--text-primary) 6%, transparent)",
                        color: "color-mix(in srgb, var(--text-primary) 45%, transparent)",
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

          {/* ADVANCED section label */}
          <div
            style={{
              fontFamily: "var(--font-mono)",
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
                  background: developerMode ? "color-mix(in srgb, var(--accent) 35%, transparent)" : "var(--control-bg)",
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
                  fontFamily: "var(--font-mono)",
                  fontSize: s(10),
                  fontWeight: 600,
                  color: "color-mix(in srgb, var(--text-primary) 25%, transparent)",
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
                        color: "color-mix(in srgb, var(--text-primary) 87%, transparent)",
                        marginBottom: 2,
                      }}
                    >
                      {t("settings.sidebarTerminal")}
                    </div>
                    <div
                      style={{
                        fontSize: s(11),
                        color: "color-mix(in srgb, var(--text-primary) 30%, transparent)",
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
                      border: "1px solid color-mix(in srgb, var(--text-primary) 12%, transparent)",
                      background: sidebarTerminalEnabled ? "color-mix(in srgb, var(--accent) 35%, transparent)" : "color-mix(in srgb, var(--text-primary) 6%, transparent)",
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
                        background: "color-mix(in srgb, var(--text-primary) 90%, transparent)",
                        transition: "left 120ms ease",
                      }}
                    />
                  </button>
                </div>
              </div>

              {/* NOTIFICATIONS section */}
              <div
                style={{
                  fontFamily: "var(--font-mono)",
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
                        fontFamily: "var(--font-ui)",
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
                  fontFamily: "var(--font-mono)",
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
                    fontFamily: "var(--font-mono)",
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
                      background: coauthorEnabled ? "color-mix(in srgb, var(--accent) 35%, transparent)" : "var(--control-bg)",
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
              fontFamily: "var(--font-mono)",
              fontSize: s(10),
              fontWeight: 600,
              color: "color-mix(in srgb, var(--text-primary) 25%, transparent)",
              letterSpacing: ".12em",
              textTransform: "uppercase",
              marginBottom: 20,
              marginTop: 12,
            }}
          >
            {t("settings.language")}
          </div>

          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: s(13), color: "color-mix(in srgb, var(--text-primary) 87%, transparent)", marginBottom: 10 }}>
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
                      background: selected ? "color-mix(in srgb, var(--text-primary) 15%, transparent)" : "color-mix(in srgb, var(--text-primary) 4%, transparent)",
                      border: selected ? "1px solid color-mix(in srgb, var(--text-primary) 22%, transparent)" : "1px solid color-mix(in srgb, var(--text-primary) 6%, transparent)",
                      color: selected ? "color-mix(in srgb, var(--text-primary) 92%, transparent)" : "color-mix(in srgb, var(--text-primary) 50%, transparent)",
                      fontSize: s(12),
                      cursor: "pointer",
                      transition: "all .2s",
                      fontFamily: "var(--font-ui)",
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
                      color: "color-mix(in srgb, var(--text-primary) 87%, transparent)",
                      marginBottom: 2,
                    }}
                  >
                    {t("settings.chromeControlsOnHover")}
                  </div>
                  <div
                    style={{
                      fontSize: s(11),
                      color: "color-mix(in srgb, var(--text-primary) 30%, transparent)",
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
                    border: "1px solid color-mix(in srgb, var(--text-primary) 12%, transparent)",
                    background: chromeControlsOnHover ? "color-mix(in srgb, var(--accent) 35%, transparent)" : "color-mix(in srgb, var(--text-primary) 6%, transparent)",
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
                      background: "color-mix(in srgb, var(--text-primary) 90%, transparent)",
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
              fontFamily: "var(--font-mono)",
              fontSize: s(10),
              fontWeight: 600,
              color: "color-mix(in srgb, var(--text-primary) 25%, transparent)",
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
              <div style={{ fontSize: s(11), color: "color-mix(in srgb, var(--text-primary) 35%, transparent)", fontFamily: "var(--font-mono)", marginBottom: 14, letterSpacing: ".04em" }}>
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
              <div style={{ fontSize: s(12), color: "color-mix(in srgb, var(--text-primary) 38%, transparent)", marginBottom: 10 }}>
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
                {updateError && <span style={{ opacity: 0.6, marginLeft: 6, fontFamily: "var(--font-mono)", fontSize: s(10) }}>{updateError.slice(0, 80)}</span>}
              </div>
            )}

            {/* Progress bar when downloading */}
            {updaterPhase === "downloading" && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: s(12), color: "color-mix(in srgb, var(--text-primary) 55%, transparent)", marginBottom: 6 }}>
                  {t("settings.downloading", { pct: downloadPct })}
                </div>
                <div style={{ height: 3, borderRadius: 2, background: "color-mix(in srgb, var(--text-primary) 8%, transparent)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${downloadPct}%`, background: "color-mix(in srgb, var(--text-primary) 40%, transparent)", transition: "width .3s ease", borderRadius: 2 }} />
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
                    background: "color-mix(in srgb, var(--text-primary) 6%, transparent)", border: "1px solid color-mix(in srgb, var(--text-primary) 6%, transparent)",
                    color: "color-mix(in srgb, var(--text-primary) 75%, transparent)", fontSize: s(12), cursor: "pointer",
                    transition: "all .2s", fontFamily: "var(--font-ui)",
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
                    background: "color-mix(in srgb, var(--text-primary) 3%, transparent)", border: "1px solid color-mix(in srgb, var(--text-primary) 6%, transparent)",
                    color: "color-mix(in srgb, var(--text-primary) 38%, transparent)", fontSize: s(12), cursor: "not-allowed",
                    fontFamily: "var(--font-ui)",
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
                    transition: "all .2s", fontFamily: "var(--font-ui)",
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
                    transition: "all .2s", fontFamily: "var(--font-ui)", fontWeight: 600,
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
                    background: "color-mix(in srgb, var(--text-primary) 6%, transparent)", border: "1px solid color-mix(in srgb, var(--text-primary) 6%, transparent)",
                    color: "color-mix(in srgb, var(--text-primary) 60%, transparent)", fontSize: s(12), cursor: "pointer",
                    transition: "all .2s", fontFamily: "var(--font-ui)",
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

function AppearancePreview({ profile, labels, s }) {
  const palette = profile.palette;
  const typography = profile.typography;
  const border = `color-mix(in srgb, ${palette.border} 18%, transparent)`;
  const softSurface = `color-mix(in srgb, ${palette.surfaceStrong} 64%, ${palette.background})`;

  return (
    <div
      style={{
        marginBottom: 14,
        borderRadius: 10,
        overflow: "hidden",
        border: `1px solid ${border}`,
        background: palette.background,
        color: palette.text,
        fontFamily: typography.uiFont,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          minHeight: 98,
          background: palette.surface,
        }}
      >
        <PreviewCodeSide
          lineColor={palette.danger}
          tokenColor={palette.danger}
          tokenName="danger"
          surface={softSurface}
          text={palette.text}
          muted={`color-mix(in srgb, ${palette.text} 42%, transparent)`}
          monoFont={typography.monoFont}
          s={s}
          side="left"
        />
        <PreviewCodeSide
          lineColor={palette.success}
          tokenColor={palette.success}
          tokenName="success"
          surface={`color-mix(in srgb, ${palette.success} 16%, ${palette.surface})`}
          text={palette.text}
          muted={`color-mix(in srgb, ${palette.text} 42%, transparent)`}
          monoFont={typography.monoFont}
          s={s}
          side="right"
        />
      </div>
      <div
        style={{
          padding: 10,
          borderTop: `1px solid ${border}`,
          background: palette.surfaceStrong,
        }}
      >
        <div
          style={{
            fontSize: s(10),
            color: `color-mix(in srgb, ${palette.text} 58%, transparent)`,
            marginBottom: 8,
            fontWeight: 600,
          }}
        >
          {labels.guideTitle}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 8,
          }}
        >
          {[
            { label: labels.logo, value: LOGO_RED, use: labels.logoUse },
            { label: labels.accent, value: palette.accent, use: labels.accentUse },
            { label: labels.success, value: palette.success, use: labels.successUse },
            { label: labels.danger, value: palette.danger, use: labels.dangerUse },
            { label: labels.warning, value: palette.warning, use: labels.warningUse },
          ].map((item) => (
            <div key={item.label} style={{ display: "grid", gridTemplateColumns: "16px 1fr", gap: 8, minWidth: 0 }}>
              <span
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 999,
                  border: `1px solid ${border}`,
                  background: item.value,
                  marginTop: 2,
                }}
              />
              <span style={{ minWidth: 0 }}>
                <span
                  style={{
                    display: "block",
                    fontSize: s(10),
                    color: `color-mix(in srgb, ${palette.text} 76%, transparent)`,
                    lineHeight: 1.25,
                  }}
                >
                  {item.label}
                </span>
                <span
                  style={{
                    display: "block",
                    fontSize: s(9),
                    color: `color-mix(in srgb, ${palette.text} 46%, transparent)`,
                    lineHeight: 1.25,
                    marginTop: 1,
                  }}
                >
                  {item.use}
                </span>
              </span>
            </div>
          ))}
          <div style={{ display: "grid", gridTemplateColumns: "16px 1fr", gap: 8, minWidth: 0 }}>
            <span
              style={{
                width: 14,
                height: 14,
                borderRadius: 4,
                border: `1px solid ${border}`,
                background: `linear-gradient(135deg, ${palette.surface} 0 50%, ${palette.text} 50% 100%)`,
                marginTop: 2,
              }}
            />
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontSize: s(10), color: `color-mix(in srgb, ${palette.text} 76%, transparent)`, lineHeight: 1.25 }}>
                {labels.surface} / {labels.text}
              </span>
              <span style={{ display: "block", fontSize: s(9), color: `color-mix(in srgb, ${palette.text} 46%, transparent)`, lineHeight: 1.25, marginTop: 1 }}>
                {labels.surfaceTextUse}
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewCodeSide({ lineColor, tokenColor, tokenName, surface, text, muted, monoFont, s, side }) {
  return (
    <div
      style={{
        padding: "12px 12px 10px",
        borderLeft: side === "right" ? `1px solid color-mix(in srgb, ${text} 10%, transparent)` : "none",
        background: surface,
        fontFamily: monoFont,
        fontSize: s(10),
        lineHeight: 1.8,
      }}
    >
      {[1, 2, 3].map((line) => (
        <div
          key={line}
          style={{
            display: "grid",
            gridTemplateColumns: "20px 1fr",
            gap: 10,
            color: line === 1 ? muted : text,
          }}
        >
          <span style={{ color: muted, textAlign: "right" }}>{line}</span>
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {line === 1 ? "themePreview = {" : line === 2 ? <><span style={{ color: tokenColor }}>{tokenName}</span>: "{lineColor}",</> : "};"}
          </span>
        </div>
      ))}
    </div>
  );
}

function SettingBlock({ children, style }) {
  return (
    <div
      style={{
        padding: 12,
        borderRadius: 8,
        background: "color-mix(in srgb, var(--control-bg) 58%, transparent)",
        border: "1px solid var(--control-border)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function SegmentedControl({ options, value, onChange, s }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
        gap: 4,
        padding: 3,
        borderRadius: 8,
        background: "var(--control-bg)",
        border: "1px solid var(--control-border)",
      }}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange?.(option.value)}
            style={{
              height: 28,
              borderRadius: 6,
              border: "none",
              background: active ? "var(--control-bg-active)" : "transparent",
              color: active ? "var(--text-primary)" : "var(--text-secondary)",
              cursor: "pointer",
              fontFamily: "var(--font-ui)",
              fontSize: s(11),
              fontWeight: active ? 600 : 500,
              transition: "background .15s, color .15s",
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function ColorField({ label, value, onChange, s }) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = (next) => {
    setDraft(next);
    if (isValidHexColor(next)) {
      onChange?.(next);
    }
  };

  return (
    <div style={fieldRowStyle}>
      <span style={{ fontSize: s(12), color: "var(--text-secondary)", fontFamily: "var(--font-ui)" }}>
        {label}
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="color"
          value={isValidHexColor(value) ? value : "#000000"}
          onChange={(e) => commit(e.target.value.toUpperCase())}
          aria-label={label}
          style={{
            width: 30,
            height: 24,
            padding: 0,
            border: "1px solid var(--control-border)",
            borderRadius: 999,
            background: "transparent",
            cursor: "pointer",
          }}
        />
        <input
          type="text"
          value={draft}
          onChange={(e) => commit(e.target.value)}
          onBlur={() => {
            if (!isValidHexColor(draft)) setDraft(value);
          }}
          spellCheck={false}
          style={{
            width: 96,
            height: 28,
            borderRadius: 8,
            border: `1px solid ${isValidHexColor(draft) ? "var(--control-border)" : "var(--danger-border)"}`,
            background: "var(--control-bg)",
            color: "var(--text-primary)",
            fontFamily: "var(--font-mono)",
            fontSize: s(11),
            padding: "0 8px",
            outline: "none",
            textTransform: "uppercase",
          }}
        />
      </div>
    </div>
  );
}

function SelectField({ label, value, options, onChange, s }) {
  return (
    <div style={fieldRowStyle}>
      <span style={{ fontSize: s(12), color: "var(--text-secondary)", fontFamily: "var(--font-ui)" }}>
        {label}
      </span>
      <div style={{ position: "relative", display: "flex", alignItems: "center", width: 210 }}>
        <select
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          style={{
            width: "100%",
            height: 30,
            borderRadius: 8,
            border: "1px solid var(--control-border)",
            background: "var(--control-bg)",
            color: "var(--text-primary)",
            fontFamily: "var(--font-ui)",
            fontSize: s(11),
            padding: "0 28px 0 10px",
            outline: "none",
            appearance: "none",
            WebkitAppearance: "none",
            MozAppearance: "none",
          }}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={12}
          strokeWidth={2}
          style={{
            position: "absolute",
            right: 10,
            color: "var(--text-muted)",
            pointerEvents: "none",
          }}
        />
      </div>
    </div>
  );
}

const fieldRowStyle = {
  minHeight: 50,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 14,
  padding: "10px 12px",
  borderBottom: "1px solid var(--control-border-soft)",
};

const iconActionStyle = {
  width: 28,
  height: 28,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 8,
  border: "1px solid var(--control-border)",
  background: "var(--control-bg)",
  color: "var(--text-secondary)",
  cursor: "pointer",
};

function smallActionStyle(s) {
  return {
    height: 28,
    padding: "0 10px",
    borderRadius: 8,
    border: "1px solid var(--control-border)",
    background: "var(--control-bg)",
    color: "var(--text-secondary)",
    cursor: "pointer",
    fontFamily: "var(--font-ui)",
    fontSize: s(11),
  };
}
