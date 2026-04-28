const STORAGE_KEY = "rayline.providerUpstreams.v1";

const SUPPORTED_PROVIDERS = ["claude", "codex"];
const DEFAULT_CONFIG = {
  baseURL: "",
  apiKey: "",
  modelListText: "",
};

const DEFAULT_STATE = {
  providers: {
    claude: { ...DEFAULT_CONFIG },
    codex: { ...DEFAULT_CONFIG },
  },
};

function safeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeProvider(provider) {
  const value = safeString(provider).toLowerCase();
  return SUPPORTED_PROVIDERS.includes(value) ? value : "";
}

function parseModelList(value) {
  return safeString(value)
    .split(/[\n,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeProviderConfig(entry) {
  if (!entry || typeof entry !== "object") return { ...DEFAULT_CONFIG };
  const rawModelList = Array.isArray(entry.modelList)
    ? entry.modelList
    : Array.isArray(entry.models)
      ? entry.models
      : null;
  const modelListText = rawModelList
    ? rawModelList.map((model) => safeString(model)).filter(Boolean).join("\n")
    : safeString(entry.modelListText || entry.modelsText || entry.models || entry.model);

  return {
    baseURL: safeString(entry.baseURL || entry.baseUrl),
    apiKey: safeString(entry.apiKey),
    modelListText,
  };
}

function migrateProfileState(state) {
  const next = { ...DEFAULT_STATE.providers };
  const profiles = Array.isArray(state?.profiles) ? state.profiles : [];
  const activeByProvider = state?.activeByProvider && typeof state.activeByProvider === "object"
    ? state.activeByProvider
    : {};

  for (const provider of SUPPORTED_PROVIDERS) {
    const activeId = safeString(activeByProvider[provider]);
    const profile = profiles.find((entry) => (
      entry?.provider === provider &&
      entry?.id === activeId &&
      entry?.enabled !== false
    )) || profiles.find((entry) => entry?.provider === provider && entry?.enabled !== false);

    if (profile) {
      next[provider] = normalizeProviderConfig({
        baseURL: profile.baseURL,
        apiKey: profile.apiKey,
        modelListText: profile.model,
      });
    }
  }

  return next;
}

function sanitizeState(state) {
  const source = state?.providers && typeof state.providers === "object"
    ? state.providers
    : migrateProfileState(state);
  const providers = {};

  for (const provider of SUPPORTED_PROVIDERS) {
    providers[provider] = normalizeProviderConfig(source[provider]);
  }

  return { providers };
}

export function loadProviderUpstreamsState() {
  if (typeof window === "undefined" || !window.localStorage) return { ...DEFAULT_STATE };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    return sanitizeState(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function saveProviderUpstreamsState(patch) {
  const current = loadProviderUpstreamsState();
  const next = sanitizeState({
    ...current,
    ...(patch || {}),
    providers: {
      ...current.providers,
      ...(patch?.providers || {}),
    },
  });

  if (typeof window !== "undefined" && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  return next;
}

export function saveProviderUpstreamConfig(provider, patch) {
  const normalizedProvider = normalizeProvider(provider);
  if (!normalizedProvider) return loadProviderUpstreamsState();

  const current = loadProviderUpstreamsState();
  return saveProviderUpstreamsState({
    providers: {
      [normalizedProvider]: {
        ...current.providers[normalizedProvider],
        ...(patch || {}),
      },
    },
  });
}

export function clearProviderUpstreamConfig(provider) {
  const normalizedProvider = normalizeProvider(provider);
  if (!normalizedProvider) return loadProviderUpstreamsState();
  return saveProviderUpstreamsState({
    providers: {
      [normalizedProvider]: { ...DEFAULT_CONFIG },
    },
  });
}

export function getProviderUpstreamConfig(provider, state = loadProviderUpstreamsState()) {
  const normalizedProvider = normalizeProvider(provider);
  if (!normalizedProvider) return null;
  const config = normalizeProviderConfig(state?.providers?.[normalizedProvider]);
  const modelList = parseModelList(config.modelListText);
  if (!config.baseURL && !config.apiKey && modelList.length === 0) return null;
  return {
    provider: normalizedProvider,
    baseURL: config.baseURL,
    apiKey: config.apiKey,
    modelList,
  };
}

function modelTag(modelId) {
  const compact = safeString(modelId).split("/").pop() || modelId;
  return compact.replace(/[^a-z0-9._-]+/gi, " ").trim().toUpperCase() || "MODEL";
}

export function buildProviderUpstreamModels(state = loadProviderUpstreamsState()) {
  const models = [];
  for (const provider of SUPPORTED_PROVIDERS) {
    const config = getProviderUpstreamConfig(provider, state);
    if (!config?.modelList?.length) continue;
    for (const modelId of config.modelList) {
      models.push({
        id: `provider-upstream:${provider}:${modelId}`,
        name: modelId,
        tag: modelTag(modelId),
        cliFlag: modelId,
        provider,
        providerOverride: true,
        contextWindow: provider === "codex" ? 1_050_000 : 200_000,
      });
    }
  }
  return models;
}
