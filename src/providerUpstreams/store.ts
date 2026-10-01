/**
 * Per-CLI custom upstream (base URL / API key / model list), persisted in
 * localStorage (`rayline.providerUpstreams.v1`). The `load*` / `save*`
 * functions keep their original contract; `getProviderUpstreamsStore()`
 * exposes the state as a shared store that every save keeps in sync.
 *
 * Model definitions come from @shared/models (`buildProviderUpstreamModels`),
 * so ids and context windows match the registry.
 */

import { buildProviderUpstreamModels as buildUpstreamModels } from "@shared/models";
import type { ClaudeModelDefinition, CodexModelDefinition } from "@shared/models";
import type {
  ProviderUpstreamConfig,
  ProviderUpstreamSettings,
  ProviderUpstreamsState,
  UpstreamProviderId,
} from "@shared/providers/types";
import { createStore, type Store } from "../store/createStore";

export type {
  ProviderUpstreamConfig,
  ProviderUpstreamSettings,
  ProviderUpstreamsState,
  UpstreamProviderId,
} from "@shared/providers/types";

const STORAGE_KEY = "rayline.providerUpstreams.v1";

export const SUPPORTED_UPSTREAM_PROVIDERS: readonly UpstreamProviderId[] = ["claude", "codex"];

const DEFAULT_CONFIG: Readonly<ProviderUpstreamSettings> = {
  enabled: false,
  baseURL: "",
  apiKey: "",
  modelListText: "",
};

function defaultState(): ProviderUpstreamsState {
  return {
    providers: {
      claude: { ...DEFAULT_CONFIG },
      codex: { ...DEFAULT_CONFIG },
    },
  };
}

type UnknownRecord = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeUpstreamProvider(provider: unknown): UpstreamProviderId | "" {
  const value = safeString(provider).toLowerCase();
  return value === "claude" || value === "codex" ? value : "";
}

/** Split newline / comma separated model ids. */
export function parseModelList(value: unknown): string[] {
  return safeString(value)
    .split(/[\n,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/** Accepts current settings and older shapes (`modelList`, `models`, `model`, `baseUrl`). */
export function normalizeProviderConfig(entry: unknown): ProviderUpstreamSettings {
  if (!isRecord(entry)) return { ...DEFAULT_CONFIG };
  const rawModelList: unknown = Array.isArray(entry.modelList)
    ? entry.modelList
    : Array.isArray(entry.models)
      ? entry.models
      : null;
  const modelListText = Array.isArray(rawModelList)
    ? (rawModelList as readonly unknown[]).map((model) => safeString(model)).filter(Boolean).join("\n")
    : safeString(entry.modelListText || entry.modelsText || entry.models || entry.model);
  const baseURL = safeString(entry.baseURL || entry.baseUrl);
  const apiKey = safeString(entry.apiKey);
  const hasConfig = Boolean(baseURL || apiKey || modelListText);
  const enabled = typeof entry.enabled === "boolean" ? entry.enabled : hasConfig;

  return { enabled, baseURL, apiKey, modelListText };
}

/** Pre-v1 `{ profiles, activeByProvider }` → one config per provider. */
function migrateProfileState(state: unknown): Record<UpstreamProviderId, unknown> {
  const next: Record<UpstreamProviderId, unknown> = defaultState().providers;
  const source: UnknownRecord = isRecord(state) ? state : {};
  const profiles: readonly unknown[] = Array.isArray(source.profiles) ? (source.profiles as readonly unknown[]) : [];
  const activeByProvider: UnknownRecord = isRecord(source.activeByProvider) ? source.activeByProvider : {};

  for (const provider of SUPPORTED_UPSTREAM_PROVIDERS) {
    const activeId = safeString(activeByProvider[provider]);
    const candidates = profiles.filter(isRecord);
    const profile =
      candidates.find((entry) => entry.provider === provider && entry.id === activeId && entry.enabled !== false) ||
      candidates.find((entry) => entry.provider === provider && entry.enabled !== false);

    if (profile) {
      next[provider] = normalizeProviderConfig({
        enabled: profile.enabled !== false,
        baseURL: profile.baseURL,
        apiKey: profile.apiKey,
        modelListText: profile.model,
      });
    }
  }

  return next;
}

export function sanitizeProviderUpstreamsState(state: unknown): ProviderUpstreamsState {
  const source: UnknownRecord =
    isRecord(state) && isRecord(state.providers) ? state.providers : migrateProfileState(state);
  return {
    providers: {
      claude: normalizeProviderConfig(source.claude),
      codex: normalizeProviderConfig(source.codex),
    },
  };
}

function getStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** Fresh read from localStorage (does not touch the shared store). */
export function loadProviderUpstreamsState(): ProviderUpstreamsState {
  const storage = getStorage();
  if (!storage) return defaultState();
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    return sanitizeProviderUpstreamsState(JSON.parse(raw));
  } catch {
    return defaultState();
  }
}

let store: Store<ProviderUpstreamsState> | null = null;

/** Shared store, created from storage on first use. */
export function getProviderUpstreamsStore(): Store<ProviderUpstreamsState> {
  store ??= createStore(loadProviderUpstreamsState());
  return store;
}

/** Re-read storage into the shared store (no notification when unchanged). */
export function reloadProviderUpstreamsStore(): ProviderUpstreamsState {
  const next = loadProviderUpstreamsState();
  const current = getProviderUpstreamsStore();
  if (JSON.stringify(current.getState()) !== JSON.stringify(next)) current.setState(next);
  return current.getState();
}

export interface ProviderUpstreamsPatch {
  providers?: Partial<Record<UpstreamProviderId, Partial<ProviderUpstreamSettings>>>;
}

export function saveProviderUpstreamsState(patch?: ProviderUpstreamsPatch | null): ProviderUpstreamsState {
  const current = loadProviderUpstreamsState();
  const next = sanitizeProviderUpstreamsState({
    ...current,
    ...patch,
    providers: {
      ...current.providers,
      ...patch?.providers,
    },
  });
  getStorage()?.setItem(STORAGE_KEY, JSON.stringify(next));
  getProviderUpstreamsStore().setState(next);
  return next;
}

export function saveProviderUpstreamConfig(
  provider: unknown,
  patch?: Partial<ProviderUpstreamSettings> | null,
): ProviderUpstreamsState {
  const normalizedProvider = normalizeUpstreamProvider(provider);
  if (!normalizedProvider) return loadProviderUpstreamsState();

  const current = loadProviderUpstreamsState();
  return saveProviderUpstreamsState({
    providers: {
      [normalizedProvider]: {
        ...current.providers[normalizedProvider],
        ...patch,
      },
    },
  });
}

export function clearProviderUpstreamConfig(provider: unknown): ProviderUpstreamsState {
  const normalizedProvider = normalizeUpstreamProvider(provider);
  if (!normalizedProvider) return loadProviderUpstreamsState();
  return saveProviderUpstreamsState({
    providers: {
      [normalizedProvider]: { ...DEFAULT_CONFIG },
    },
  });
}

/** Active config to send to the main process, or null when disabled / empty. */
export function getProviderUpstreamConfig(
  provider: unknown,
  state: ProviderUpstreamsState = loadProviderUpstreamsState(),
): ProviderUpstreamConfig | null {
  const normalizedProvider = normalizeUpstreamProvider(provider);
  if (!normalizedProvider) return null;
  const config = normalizeProviderConfig(state.providers[normalizedProvider]);
  const modelList = parseModelList(config.modelListText);
  if (!config.enabled) return null;
  if (!config.baseURL && !config.apiKey && modelList.length === 0) return null;
  return {
    provider: normalizedProvider,
    baseURL: config.baseURL,
    apiKey: config.apiKey,
    modelList,
  };
}

/**
 * One model per id in each active upstream's model list (built by
 * @shared/models, so the context window is the registry's
 * `PROVIDER_UPSTREAM_*_CONTEXT_WINDOW`).
 */
export function buildProviderUpstreamModels(
  state: ProviderUpstreamsState = loadProviderUpstreamsState(),
): (ClaudeModelDefinition | CodexModelDefinition)[] {
  return buildUpstreamModels(SUPPORTED_UPSTREAM_PROVIDERS.map((provider) => getProviderUpstreamConfig(provider, state)));
}
