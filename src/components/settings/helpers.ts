/**
 * Pure helpers for the Settings view (no React, no DOM). Covered by
 * __tests__/helpers.test.ts.
 */

import type {
  MulticaStoreState,
  OpenCodeModelEntry,
  OpenCodeProviderConfig,
  ProviderUpstreamSettings,
  UpstreamProviderId,
} from "@shared/providers/types";
import type {
  Appearance,
  AppearancePaletteKey,
  AppearanceProfile,
  AppearanceTypographyKey,
  ThemeMode,
} from "@shared/state/types";
import type { Translator } from "../../i18n";

// ── Provider upstreams ──────────────────────────────────────────────────────

export const UPSTREAM_PROVIDERS: readonly UpstreamProviderId[] = ["claude", "codex"];

export const EMPTY_UPSTREAM_CONFIG: Readonly<ProviderUpstreamSettings> = Object.freeze({
  enabled: false,
  baseURL: "",
  apiKey: "",
  modelListText: "",
});

export type UpstreamDrafts = Record<UpstreamProviderId, ProviderUpstreamSettings>;
export type UpstreamFlags = Partial<Record<UpstreamProviderId, boolean>>;

type UpstreamConfigs = Partial<Record<UpstreamProviderId, Partial<ProviderUpstreamSettings> | null | undefined>>;

export function normalizeUpstreamDraft(config: Partial<ProviderUpstreamSettings> | null | undefined): ProviderUpstreamSettings {
  return {
    enabled: config?.enabled ?? EMPTY_UPSTREAM_CONFIG.enabled,
    baseURL: config?.baseURL ?? EMPTY_UPSTREAM_CONFIG.baseURL,
    apiKey: config?.apiKey ?? EMPTY_UPSTREAM_CONFIG.apiKey,
    modelListText: config?.modelListText ?? EMPTY_UPSTREAM_CONFIG.modelListText,
  };
}

export function normalizeUpstreamDrafts(configs: UpstreamConfigs | null | undefined): UpstreamDrafts {
  return {
    claude: normalizeUpstreamDraft(configs?.claude),
    codex: normalizeUpstreamDraft(configs?.codex),
  };
}

/** Re-sync drafts from the store, keeping providers the user is editing. */
export function mergeUpstreamDrafts(prev: UpstreamDrafts, configs: UpstreamConfigs | null | undefined, dirty: UpstreamFlags): UpstreamDrafts {
  const normalized = normalizeUpstreamDrafts(configs);
  return {
    claude: dirty.claude ? prev.claude : normalized.claude,
    codex: dirty.codex ? prev.codex : normalized.codex,
  };
}

export type UpstreamStatusKey =
  | "settings.upstreamConfigured"
  | "settings.upstreamEnabledNoConfig"
  | "settings.upstreamSavedDisabled"
  | "settings.upstreamUsingDefault";

export interface UpstreamStatus {
  configured: boolean;
  enabled: boolean;
  /** Enabled and has at least one value: the CLI is actually overridden. */
  activeOverride: boolean;
  statusKey: UpstreamStatusKey;
}

export function getUpstreamStatus(draft: ProviderUpstreamSettings): UpstreamStatus {
  const configured = Boolean(draft.baseURL.trim() || draft.apiKey.trim() || draft.modelListText.trim());
  const enabled = Boolean(draft.enabled);
  const activeOverride = enabled && configured;
  const statusKey: UpstreamStatusKey = activeOverride
    ? "settings.upstreamConfigured"
    : enabled
      ? "settings.upstreamEnabledNoConfig"
      : configured
        ? "settings.upstreamSavedDisabled"
        : "settings.upstreamUsingDefault";
  return { configured, enabled, activeOverride, statusKey };
}

// ── Multica ─────────────────────────────────────────────────────────────────

export type MulticaStatusKey =
  | "settings.multicaConnected"
  | "settings.multicaAuthenticatedNoWorkspace"
  | "settings.multicaServerConfigured"
  | "settings.multicaNotConfigured";

export function isMulticaConnected(state: Pick<MulticaStoreState, "token" | "serverUrl" | "workspaceId" | "workspaceSlug">): boolean {
  return Boolean(state.token && state.serverUrl && (state.workspaceId || state.workspaceSlug));
}

export function getMulticaStatusKey(state: Pick<MulticaStoreState, "token" | "serverUrl" | "workspaceId" | "workspaceSlug">): MulticaStatusKey {
  if (isMulticaConnected(state)) return "settings.multicaConnected";
  if (state.token && state.serverUrl) return "settings.multicaAuthenticatedNoWorkspace";
  if (state.serverUrl) return "settings.multicaServerConfigured";
  return "settings.multicaNotConfigured";
}

/** Patch that drops the session but keeps the server URL. */
export const MULTICA_SESSION_RESET: Readonly<Partial<MulticaStoreState>> = Object.freeze({
  token: "",
  tokenIssuedAt: 0,
  workspaceId: "",
  workspaceSlug: "",
  agentsCache: [],
  agentsCachedAt: 0,
});

// ── Remote SSH ──────────────────────────────────────────────────────────────

/** What App's `handleConnectRemoteSsh` resolves to. */
export type RemoteSshConnectResult =
  | { ok: true; claude?: boolean; codex?: boolean; claudePath?: string; codexPath?: string }
  | { ok: false; error?: string };

export type RemoteSshStatusKind = "idle" | "connecting" | "success" | "warning" | "error";

export interface RemoteSshStatus {
  kind: RemoteSshStatusKind;
  text: string;
}

export const IDLE_REMOTE_SSH_STATUS: RemoteSshStatus = Object.freeze({ kind: "idle", text: "" });

export function remoteSshResultToStatus(result: RemoteSshConnectResult | null | undefined, t: Translator): RemoteSshStatus {
  if (result?.ok) {
    const runtimes = [result.claude ? "Claude Code" : "", result.codex ? "Codex" : ""].filter(Boolean).join(", ");
    if (!runtimes) return { kind: "warning", text: t("settings.remoteSshConnectedNoRuntime") };
    return { kind: "success", text: t("settings.remoteSshConnected", { value: runtimes }) };
  }
  const error = result?.error;
  if (error === "required") return { kind: "error", text: t("settings.remoteSshCommandRequired") };
  if (error === "invalid") return { kind: "error", text: t("settings.remoteSshCommandInvalid") };
  return { kind: "error", text: [t("settings.remoteSshFailed"), error].filter(Boolean).join(" ") };
}

export function remoteSshStatusColor(kind: RemoteSshStatusKind): string {
  switch (kind) {
    case "error":
      return "var(--danger-text)";
    case "success":
      return "var(--success-text)";
    case "warning":
      return "var(--warning-text)";
    case "idle":
    case "connecting":
      return "color-mix(in srgb, var(--text-primary) 52%, transparent)";
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

// ── OpenCode ────────────────────────────────────────────────────────────────

export interface OpenCodeDraft {
  providerId: string;
  modelId: string;
  label: string;
  apiKey: string;
  baseURL: string;
  enabled: boolean;
  thinking: boolean;
}

export const DEFAULT_OPENCODE_PROVIDER = "openrouter";

export const INITIAL_OPENCODE_DRAFT: Readonly<OpenCodeDraft> = Object.freeze({
  providerId: DEFAULT_OPENCODE_PROVIDER,
  modelId: "",
  label: "",
  apiKey: "",
  baseURL: "",
  enabled: true,
  thinking: false,
});

/** Clears everything but the provider (the add form remembers it). */
export function clearOpenCodeDraft(prev: OpenCodeDraft): OpenCodeDraft {
  return { ...INITIAL_OPENCODE_DRAFT, providerId: prev.providerId };
}

/** Edit form: the stored API key is never echoed back. */
export function openCodeDraftFromModel(model: OpenCodeModelEntry): OpenCodeDraft {
  return {
    providerId: model.providerId || DEFAULT_OPENCODE_PROVIDER,
    modelId: model.modelId || "",
    label: model.label || "",
    apiKey: "",
    baseURL: model.baseURL || "",
    enabled: model.enabled !== false,
    thinking: Boolean(model.thinking),
  };
}

/** Duplicate form: copies credentials, falling back to the provider config on disk. */
export function openCodeDuplicateDraft(model: OpenCodeModelEntry, providerConfig: OpenCodeProviderConfig): OpenCodeDraft {
  return {
    providerId: model.providerId || DEFAULT_OPENCODE_PROVIDER,
    modelId: model.modelId || "",
    label: model.label ? `${model.label} (copy)` : "",
    apiKey: model.apiKey || providerConfig.apiKey || "",
    baseURL: model.baseURL || providerConfig.baseURL || "",
    enabled: model.enabled !== false,
    thinking: Boolean(model.thinking),
  };
}

/** Narrow an `opencode-get-provider-config` result that may be malformed. */
export function toOpenCodeProviderConfig(value: unknown): OpenCodeProviderConfig {
  if (!value || typeof value !== "object") return { apiKey: "", baseURL: "" };
  const record = value as Record<string, unknown>;
  return {
    apiKey: typeof record.apiKey === "string" ? record.apiKey : "",
    baseURL: typeof record.baseURL === "string" ? record.baseURL : "",
  };
}

export type OpenCodeValidation =
  | { ok: true; providerId: string; modelId: string; modelKey: string }
  | { ok: false; errorKey: "settings.opencodeMissingModel" | "settings.opencodeDuplicateConflict" };

export function validateOpenCodeDraft(draft: OpenCodeDraft, duplicateSourceId: string): OpenCodeValidation {
  const providerId = draft.providerId.trim();
  const modelId = draft.modelId.trim();
  if (!providerId || !modelId) return { ok: false, errorKey: "settings.opencodeMissingModel" };
  const modelKey = `${providerId}/${modelId}`;
  if (duplicateSourceId && duplicateSourceId === modelKey) return { ok: false, errorKey: "settings.opencodeDuplicateConflict" };
  return { ok: true, providerId, modelId, modelKey };
}

/** Editing keeps the stored key when the field is left blank. */
export function resolveOpenCodeApiKey(
  draft: OpenCodeDraft,
  editingId: string,
  models: readonly OpenCodeModelEntry[],
  modelKey: string,
): string {
  if (draft.apiKey) return draft.apiKey;
  if (!editingId) return "";
  const existing = models.find((model) => model.id === editingId || model.id === modelKey);
  return existing?.apiKey || "";
}

export function buildOpenCodeProviderOptions(supportedProviders: readonly string[], providers: readonly string[]): string[] {
  const all = [...supportedProviders, ...providers, DEFAULT_OPENCODE_PROVIDER]
    .map((provider) => String(provider || "").trim())
    .filter(Boolean);
  return [...new Set(all)].sort((a, b) => a.localeCompare(b));
}

export const OPENCODE_PROVIDER_OPTION_LIMIT = 12;

export function filterOpenCodeProviderOptions(options: readonly string[], query: string): string[] {
  const needle = query.trim().toLowerCase();
  return options
    .filter((provider) => !needle || provider.toLowerCase().includes(needle))
    .slice(0, OPENCODE_PROVIDER_OPTION_LIMIT);
}

/** Keyboard navigation inside the provider combobox, clamped to the list. */
export function moveHighlight(index: number, delta: 1 | -1, count: number): number {
  if (count <= 0) return 0;
  return Math.min(Math.max(index + delta, 0), count - 1);
}

export function isOpenCodeReady(configured: boolean, models: readonly Pick<OpenCodeModelEntry, "apiKey" | "baseURL">[]): boolean {
  return configured || models.some((model) => Boolean(model.apiKey || model.baseURL));
}

// ── Appearance ──────────────────────────────────────────────────────────────

export type AppearanceProfileUpdate =
  | { section: "palette"; key: AppearancePaletteKey; value: string }
  | { section: "typography"; key: AppearanceTypographyKey; value: string };

export function updateAppearanceProfile(appearance: Appearance, theme: ThemeMode, update: AppearanceProfileUpdate): Appearance {
  const profile: AppearanceProfile = appearance.profiles[theme];
  const nextProfile: AppearanceProfile = update.section === "palette"
    ? { ...profile, palette: { ...profile.palette, [update.key]: update.value } }
    : { ...profile, typography: { ...profile.typography, [update.key]: update.value } };
  return { ...appearance, profiles: { ...appearance.profiles, [theme]: nextProfile } };
}

export function resetAppearanceProfile(appearance: Appearance, theme: ThemeMode, defaults: Appearance): Appearance {
  return { ...appearance, profiles: { ...appearance.profiles, [theme]: defaults.profiles[theme] } };
}

// ── Wallpaper ───────────────────────────────────────────────────────────────

/** Last two path segments, for the hint under the thumbnail. */
export function wallpaperPathHint(path: string | null | undefined): string | null {
  return path ? path.split(/[/\\]/).slice(-2).join("/") : null;
}
