const STORAGE_KEY = "rayline.providerUpstreams.v1";

const DEFAULT_STATE = {
  profiles: [],
  activeByProvider: {},
};

const SUPPORTED_PROVIDERS = new Set(["claude", "codex"]);
const CLAUDE_AUTH_FIELDS = new Set(["ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_API_KEY"]);
const CODEX_WIRE_APIS = new Set(["responses", "chat"]);

function safeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function makeProfileId(provider) {
  return `${provider}:${Date.now()}:${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeProvider(provider) {
  const value = safeString(provider).toLowerCase();
  return SUPPORTED_PROVIDERS.has(value) ? value : "";
}

function sanitizeProfile(entry) {
  if (!entry || typeof entry !== "object") return null;
  const provider = normalizeProvider(entry.provider);
  if (!provider) return null;

  const name = safeString(entry.name);
  if (!name) return null;

  const authField = CLAUDE_AUTH_FIELDS.has(entry.authField)
    ? entry.authField
    : "ANTHROPIC_AUTH_TOKEN";
  const wireApi = CODEX_WIRE_APIS.has(entry.wireApi) ? entry.wireApi : "responses";
  const now = Date.now();

  return {
    id: safeString(entry.id) || makeProfileId(provider),
    provider,
    name,
    baseURL: safeString(entry.baseURL),
    apiKey: safeString(entry.apiKey),
    model: safeString(entry.model),
    enabled: typeof entry.enabled === "boolean" ? entry.enabled : true,
    authField,
    wireApi,
    createdAt: Number.isFinite(entry.createdAt) ? entry.createdAt : now,
    updatedAt: Number.isFinite(entry.updatedAt) ? entry.updatedAt : now,
  };
}

function sanitizeState(state) {
  const profiles = [];
  const seen = new Set();

  for (const raw of Array.isArray(state?.profiles) ? state.profiles : []) {
    const profile = sanitizeProfile(raw);
    if (!profile || seen.has(profile.id)) continue;
    seen.add(profile.id);
    profiles.push(profile);
  }

  const activeByProvider = {};
  const rawActive = state?.activeByProvider && typeof state.activeByProvider === "object"
    ? state.activeByProvider
    : {};

  for (const provider of SUPPORTED_PROVIDERS) {
    const activeId = safeString(rawActive[provider]);
    if (activeId && profiles.some((profile) => profile.provider === provider && profile.id === activeId)) {
      activeByProvider[provider] = activeId;
    }
  }

  return {
    ...DEFAULT_STATE,
    profiles,
    activeByProvider,
  };
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
  });

  if (typeof window !== "undefined" && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  return next;
}

export function upsertProviderUpstreamProfile(entry) {
  const current = loadProviderUpstreamsState();
  const incoming = sanitizeProfile({
    ...entry,
    updatedAt: Date.now(),
  });
  if (!incoming) return current;

  const existing = current.profiles.find((profile) => profile.id === incoming.id);
  const nextProfile = {
    ...existing,
    ...incoming,
    createdAt: existing?.createdAt || incoming.createdAt || Date.now(),
    updatedAt: Date.now(),
  };
  const profiles = existing
    ? current.profiles.map((profile) => (profile.id === incoming.id ? nextProfile : profile))
    : [nextProfile, ...current.profiles];
  const activeByProvider = {
    ...current.activeByProvider,
    [nextProfile.provider]: nextProfile.enabled === false ? "" : nextProfile.id,
  };

  return saveProviderUpstreamsState({ profiles, activeByProvider });
}

export function removeProviderUpstreamProfile(profileId) {
  const current = loadProviderUpstreamsState();
  const id = safeString(profileId);
  const removed = current.profiles.find((profile) => profile.id === id);
  const profiles = current.profiles.filter((profile) => profile.id !== id);
  const activeByProvider = { ...current.activeByProvider };
  if (removed && activeByProvider[removed.provider] === id) {
    delete activeByProvider[removed.provider];
  }
  return saveProviderUpstreamsState({ profiles, activeByProvider });
}

export function setActiveProviderUpstream(provider, profileId) {
  const normalizedProvider = normalizeProvider(provider);
  if (!normalizedProvider) return loadProviderUpstreamsState();

  const current = loadProviderUpstreamsState();
  const id = safeString(profileId);
  const activeByProvider = { ...current.activeByProvider };

  if (!id) {
    delete activeByProvider[normalizedProvider];
  } else if (
    current.profiles.some((profile) => (
      profile.provider === normalizedProvider &&
      profile.id === id &&
      profile.enabled !== false
    ))
  ) {
    activeByProvider[normalizedProvider] = id;
  }

  return saveProviderUpstreamsState({ activeByProvider });
}

export function getActiveProviderUpstreamConfig(provider, state = loadProviderUpstreamsState()) {
  const normalizedProvider = normalizeProvider(provider);
  if (!normalizedProvider) return null;
  const activeId = safeString(state?.activeByProvider?.[normalizedProvider]);
  if (!activeId) return null;
  const profile = (state?.profiles || []).find((entry) => (
    entry.id === activeId &&
    entry.provider === normalizedProvider &&
    entry.enabled !== false
  ));
  if (!profile) return null;
  return {
    provider: profile.provider,
    profileId: profile.id,
    name: profile.name,
    baseURL: profile.baseURL,
    apiKey: profile.apiKey,
    model: profile.model,
    authField: profile.authField,
    wireApi: profile.wireApi,
  };
}
