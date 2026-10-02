/**
 * Persisted app settings (formerly ~25 `useState`s at the top of App).
 * Components subscribe to single fields with `useAppSetting`, so a slider in
 * Settings re-renders only what reads that value. Handlers read
 * `appSettingsStore.getState()` instead of closing over render values.
 */

import type {
  Appearance,
  Locale,
  PersistedAppState,
  ProjectMeta,
  Wallpaper,
} from "@shared/state/types";
import type { RemoteSshRuntimeState } from "@shared/providers/types";
import { DEFAULT_MODEL_ID, normalizeModelId } from "@shared/models/registry";
import { createStore, useStore } from "./createStore";
import { normalizeEffortByModel, type EffortByModel } from "../app/effortMemory";
import { detectDefaultLocale, normalizeLocale } from "../i18n";
import { normalizeAppearance } from "../utils/appearance";
import { getPersistedWallpaper, normalizeWallpaper } from "../utils/wallpaper";

export const DEFAULT_FONT_SIZE = 17;
export const DEFAULT_SIDEBAR_ACTIVE_OPACITY = 4;
export const DEFAULT_COAUTHOR_TRAILER =
  "Co-Authored-By: r-yline[bot] <277407097+r-yline[bot]@users.noreply.github.com>";

export interface AppSettings {
  defaultModel: string;
  /** Last reasoning effort picked per model (see app/effortMemory). */
  effortByModel: EffortByModel;
  /** App-level working directory (folder picker). */
  cwd: string | null;
  locale: Locale;
  /** 12–22 */
  fontSize: number;
  /** 0–20 */
  sidebarActiveOpacity: number;
  /** Runtime wallpaper (data URL loaded from `path`). */
  wallpaper: Wallpaper | null;
  appearance: Appearance;
  projects: Record<string, ProjectMeta>;
  draftsCollapsed: boolean;
  defaultPrBranch: string;
  coauthorEnabled: boolean;
  coauthorTrailer: string;
  /** 0–20 */
  appBlur: number;
  /** 30–100 */
  appOpacity: number;
  developerMode: boolean;
  sidebarTerminalEnabled: boolean;
  remoteSshCommand: string;
  remoteSshRuntime: RemoteSshRuntimeState;
  chromeControlsOnHover: boolean;
  notificationSound: string;
  notificationsMuted: boolean;
}

export function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

export function normalizeRemoteSshCommand(value: unknown): string {
  return typeof value === "string" ? value.slice(0, 2000) : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function normalizeRemoteSshRuntime(value: unknown, fallbackCommand = ""): RemoteSshRuntimeState {
  if (!isRecord(value)) {
    return {
      sshCommand: normalizeRemoteSshCommand(fallbackCommand).trim(),
      connected: false,
      claude: false,
      codex: false,
      claudePath: "",
      codexPath: "",
      checkedAt: 0,
    };
  }
  const checkedAt = value.checkedAt;
  return {
    sshCommand: normalizeRemoteSshCommand(value.sshCommand || fallbackCommand).trim(),
    connected: value.connected === true,
    claude: value.claude === true,
    codex: value.codex === true,
    claudePath: typeof value.claudePath === "string" ? value.claudePath.trim() : "",
    codexPath: typeof value.codexPath === "string" ? value.codexPath.trim() : "",
    checkedAt: typeof checkedAt === "number" && Number.isFinite(checkedAt) ? checkedAt : 0,
  };
}

export function createDefaultSettings(): AppSettings {
  return {
    defaultModel: DEFAULT_MODEL_ID,
    effortByModel: {},
    cwd: null,
    locale: detectDefaultLocale(),
    fontSize: DEFAULT_FONT_SIZE,
    sidebarActiveOpacity: DEFAULT_SIDEBAR_ACTIVE_OPACITY,
    wallpaper: null,
    appearance: normalizeAppearance(),
    projects: {},
    draftsCollapsed: false,
    defaultPrBranch: "main",
    coauthorEnabled: true,
    coauthorTrailer: DEFAULT_COAUTHOR_TRAILER,
    appBlur: 0,
    appOpacity: 100,
    developerMode: true,
    sidebarTerminalEnabled: false,
    remoteSshCommand: "",
    remoteSshRuntime: normalizeRemoteSshRuntime(null),
    chromeControlsOnHover: false,
    notificationSound: "glass",
    notificationsMuted: false,
  };
}

/**
 * Merge a persisted state (possibly from an older version) into `base`.
 * Mirrors App's former load effect field by field. `projects` is passed
 * through `normalizeProjects` (owned by the caller).
 */
export function settingsFromPersisted(
  state: Omit<PersistedAppState, "convos">,
  base: AppSettings,
  normalizeProjects: (projects: Record<string, ProjectMeta>) => Record<string, ProjectMeta>,
): AppSettings {
  const next: AppSettings = { ...base };
  if (state.cwd) next.cwd = state.cwd;
  if (state.defaultModel) next.defaultModel = normalizeModelId(state.defaultModel);
  if (state.effortByModel) next.effortByModel = normalizeEffortByModel(state.effortByModel);
  if (state.locale) next.locale = normalizeLocale(state.locale);
  if (state.appearance) next.appearance = normalizeAppearance(state.appearance);
  if (state.fontSize) next.fontSize = state.fontSize;
  if (state.sidebarActiveOpacity != null) {
    next.sidebarActiveOpacity = clampNumber(state.sidebarActiveOpacity, 0, 20, DEFAULT_SIDEBAR_ACTIVE_OPACITY);
  }
  if (state.defaultPrBranch) next.defaultPrBranch = state.defaultPrBranch;
  if (state.coauthorEnabled != null) next.coauthorEnabled = Boolean(state.coauthorEnabled);
  if (typeof state.coauthorTrailer === "string") next.coauthorTrailer = state.coauthorTrailer;
  if (state.appBlur != null) next.appBlur = clampNumber(state.appBlur, 0, 20, 0);
  if (state.appOpacity != null) next.appOpacity = clampNumber(state.appOpacity, 30, 100, 100);
  if (state.developerMode != null) next.developerMode = Boolean(state.developerMode);
  if (typeof state.sidebarTerminalEnabled === "boolean") next.sidebarTerminalEnabled = state.sidebarTerminalEnabled;
  if (typeof state.remoteSshCommand === "string") {
    const command = normalizeRemoteSshCommand(state.remoteSshCommand);
    next.remoteSshCommand = command;
    next.remoteSshRuntime = normalizeRemoteSshRuntime(state.remoteSshRuntime, command);
  }
  if (typeof state.chromeControlsOnHover === "boolean") next.chromeControlsOnHover = state.chromeControlsOnHover;
  if (typeof state.notificationSound === "string") next.notificationSound = state.notificationSound;
  if (typeof state.notificationsMuted === "boolean") next.notificationsMuted = state.notificationsMuted;
  // Migrate legacy "zh"/"en" language key to locale.
  if (state.language === "zh") next.locale = "zh-CN";
  else if (state.language === "en") next.locale = "en-US";
  if (state.wallpaper) next.wallpaper = normalizeWallpaper({ ...state.wallpaper });
  if (state.projects) next.projects = normalizeProjects(state.projects);
  if (state.draftsCollapsed != null) next.draftsCollapsed = state.draftsCollapsed;
  return next;
}

/** The settings slice of the persisted index (`state.json`). */
export type PersistedSettings = Pick<
  PersistedAppState,
  | "cwd"
  | "defaultModel"
  | "effortByModel"
  | "locale"
  | "fontSize"
  | "sidebarActiveOpacity"
  | "wallpaper"
  | "appearance"
  | "projects"
  | "draftsCollapsed"
  | "defaultPrBranch"
  | "coauthorEnabled"
  | "coauthorTrailer"
  | "appBlur"
  | "appOpacity"
  | "developerMode"
  | "sidebarTerminalEnabled"
  | "remoteSshCommand"
  | "remoteSshRuntime"
  | "chromeControlsOnHover"
  | "notificationSound"
  | "notificationsMuted"
>;

export function toPersistedSettings(settings: AppSettings): PersistedSettings {
  return {
    cwd: settings.cwd,
    defaultModel: settings.defaultModel,
    effortByModel: settings.effortByModel,
    locale: settings.locale,
    fontSize: settings.fontSize,
    sidebarActiveOpacity: settings.sidebarActiveOpacity,
    wallpaper: settings.wallpaper ? getPersistedWallpaper({ ...settings.wallpaper }) : null,
    appearance: settings.appearance,
    projects: settings.projects,
    draftsCollapsed: settings.draftsCollapsed,
    defaultPrBranch: settings.defaultPrBranch,
    coauthorEnabled: settings.coauthorEnabled,
    coauthorTrailer: settings.coauthorTrailer,
    appBlur: settings.appBlur,
    appOpacity: settings.appOpacity,
    developerMode: settings.developerMode,
    sidebarTerminalEnabled: settings.sidebarTerminalEnabled,
    remoteSshCommand: settings.remoteSshCommand,
    remoteSshRuntime: settings.remoteSshRuntime,
    chromeControlsOnHover: settings.chromeControlsOnHover,
    notificationSound: settings.notificationSound,
    notificationsMuted: settings.notificationsMuted,
  };
}

export const appSettingsStore = createStore<AppSettings>(createDefaultSettings());

export function getAppSettings(): AppSettings {
  return appSettingsStore.getState();
}

/** Set one setting; no-op (no notification) when the value is unchanged. */
export function setAppSetting<K extends keyof AppSettings>(
  key: K,
  value: AppSettings[K] | ((prev: AppSettings[K]) => AppSettings[K]),
): void {
  appSettingsStore.setState((prev) => {
    const nextValue = typeof value === "function" ? value(prev[key]) : value;
    return Object.is(prev[key], nextValue) ? prev : { ...prev, [key]: nextValue };
  });
}

export function useAppSetting<K extends keyof AppSettings>(key: K): AppSettings[K] {
  return useStore(appSettingsStore, (state) => state[key]);
}
