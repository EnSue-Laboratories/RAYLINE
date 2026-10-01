/** Settings-panel actions that do more than set a field. */

import type { Appearance, Locale, Wallpaper } from "@shared/state/types";
import {
  appSettingsStore,
  clampNumber,
  DEFAULT_FONT_SIZE,
  DEFAULT_SIDEBAR_ACTIVE_OPACITY,
  normalizeRemoteSshCommand,
  normalizeRemoteSshRuntime,
  setAppSetting,
} from "../../store/appSettings";
import { normalizeLocale } from "../../i18n";
import { normalizeAppearance } from "../../utils/appearance";
import { DEFAULT_WALLPAPER, normalizeWallpaper } from "../../utils/wallpaper";
import { isSshCommand } from "@shared/models/dynamic-models";
import { getApi } from "../lib/api";
import type { ControlChange } from "../types";

export function setAppearance(next: unknown): void {
  setAppSetting("appearance", normalizeAppearance(next));
}

export function setLocale(next: unknown): void {
  setAppSetting("locale", normalizeLocale(next));
}

export function setWallpaper(next: Wallpaper | null): void {
  setAppSetting("wallpaper", next);
}

export function setRemoteSshCommand(value: string): void {
  const nextCommand = normalizeRemoteSshCommand(value);
  const normalizedNextCommand = nextCommand.trim();
  appSettingsStore.setState((prev) => ({
    ...prev,
    remoteSshCommand: nextCommand,
    remoteSshRuntime:
      prev.remoteSshRuntime.sshCommand === normalizedNextCommand ? prev.remoteSshRuntime : normalizeRemoteSshRuntime(null, normalizedNextCommand),
  }));
}

export type RemoteSshConnectResult =
  | { ok: false; error: string }
  | { ok: true; claude: boolean; codex: boolean; claudePath: string; codexPath: string };

/** Settings "Connect": probe the SSH host for Claude / Codex CLIs. */
export async function connectRemoteSsh(command: string): Promise<RemoteSshConnectResult> {
  const sshCommand = normalizeRemoteSshCommand(command).trim();
  if (!sshCommand) return { ok: false, error: "required" };
  if (!isSshCommand(sshCommand)) return { ok: false, error: "invalid" };
  const api = getApi();
  if (!api || typeof api.remoteRuntimeCheck !== "function") return { ok: false, error: "Remote runtime check is unavailable." };
  const result = await api.remoteRuntimeCheck({ sshCommand });
  if (!result.ok) {
    setAppSetting(
      "remoteSshRuntime",
      normalizeRemoteSshRuntime({ sshCommand, connected: "connected" in result && result.connected, checkedAt: Date.now() }, sshCommand),
    );
    return { ok: false, error: result.error || result.stderr || "SSH check failed." };
  }
  const next = normalizeRemoteSshRuntime(
    {
      sshCommand,
      connected: "connected" in result && result.connected,
      claude: "claude" in result && result.claude,
      codex: "codex" in result && result.codex,
      claudePath: "claudePath" in result ? result.claudePath : "",
      codexPath: "codexPath" in result ? result.codexPath : "",
      checkedAt: Date.now(),
    },
    sshCommand,
  );
  setAppSetting("remoteSshRuntime", next);
  return { ok: true, claude: next.claude, codex: next.codex, claudePath: next.claudePath, codexPath: next.codexPath };
}

// ── Value controls (ValueControlBlock / lab bridge) ─────────────────────────

const LAB_CONTROL_ENDPOINT = "http://127.0.0.1:4001/control";
const LAB_CONTROL_COMMIT_DELAY_MS = 1000;
const labControlTimers = new Map<string, ReturnType<typeof setTimeout>>();

const CONTROL_TARGETS = new Set([
  "wallpaper.imgBlur",
  "wallpaper.imgOpacity",
  "app.blur",
  "app.opacity",
  "fontSize",
  "app.fontSize",
  "sidebar.activeOpacity",
  "lab.imageOpacity",
  "lab.imageBlur",
  "lab.panelOpacity",
]);

export function canControlTarget(target: string): boolean {
  return CONTROL_TARGETS.has(target);
}

function queueLabControlUpdate(target: string, value: unknown): void {
  const existing = labControlTimers.get(target);
  if (existing) clearTimeout(existing);
  labControlTimers.set(
    target,
    setTimeout(() => {
      labControlTimers.delete(target);
      fetch(LAB_CONTROL_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, value }),
      }).catch((error: unknown) => {
        console.warn("[control-bridge] failed to update lab target:", target, error);
      });
    }, LAB_CONTROL_COMMIT_DELAY_MS),
  );
}

export function cancelLabControlUpdates(): void {
  for (const timer of labControlTimers.values()) clearTimeout(timer);
  labControlTimers.clear();
}

function patchWallpaper(patch: Partial<Wallpaper>): void {
  setAppSetting("wallpaper", (prev) => normalizeWallpaper({ ...(prev ?? DEFAULT_WALLPAPER), ...patch }));
}

export function applyControlChange({ target, value }: ControlChange): void {
  switch (target) {
    case "wallpaper.imgBlur":
      patchWallpaper({ imgBlur: clampNumber(value, 0, 32, DEFAULT_WALLPAPER.imgBlur) });
      return;
    case "wallpaper.imgOpacity":
      patchWallpaper({ imgOpacity: clampNumber(value, 0, 100, DEFAULT_WALLPAPER.imgOpacity) });
      return;
    case "app.blur":
      setAppSetting("appBlur", clampNumber(value, 0, 20, 0));
      return;
    case "app.opacity":
      setAppSetting("appOpacity", clampNumber(value, 30, 100, 100));
      return;
    case "fontSize":
    case "app.fontSize":
      setAppSetting("fontSize", clampNumber(value, 12, 22, DEFAULT_FONT_SIZE));
      return;
    case "sidebar.activeOpacity":
      setAppSetting("sidebarActiveOpacity", clampNumber(value, 0, 20, DEFAULT_SIDEBAR_ACTIVE_OPACITY));
      return;
    case "lab.imageOpacity":
    case "lab.imageBlur":
    case "lab.panelOpacity":
      queueLabControlUpdate(target, value);
      return;
    default:
      return;
  }
}

/** Typed setters for the Settings panel (stable module functions). */
export const settingSetters = {
  onAppearanceChange: (next: Appearance) => setAppearance(next),
  onLocaleChange: (next: Locale) => setLocale(next),
  onWallpaperChange: setWallpaper,
  onFontSizeChange: (v: number) => setAppSetting("fontSize", v),
  onDefaultPrBranchChange: (v: string) => setAppSetting("defaultPrBranch", v),
  onCoauthorEnabledChange: (v: boolean) => setAppSetting("coauthorEnabled", v),
  onAppBlurChange: (v: number) => setAppSetting("appBlur", v),
  onAppOpacityChange: (v: number) => setAppSetting("appOpacity", v),
  onDeveloperModeChange: (v: boolean) => setAppSetting("developerMode", v),
  onSidebarTerminalEnabledChange: (v: boolean) => setAppSetting("sidebarTerminalEnabled", v),
  onRemoteSshCommandChange: setRemoteSshCommand,
  onConnectRemoteSsh: connectRemoteSsh,
  onChromeControlsOnHoverChange: (v: boolean) => setAppSetting("chromeControlsOnHover", v),
  onNotificationSoundChange: (v: string) => setAppSetting("notificationSound", v),
  onNotificationsMutedChange: (v: boolean) => setAppSetting("notificationsMuted", v),
} as const;
