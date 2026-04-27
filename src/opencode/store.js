const STORAGE_KEY = "rayline.opencode.v1";

const DEFAULT_STATE = {
  models: [],
};

function safeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function inferThinkingDefault(providerId, modelId) {
  const value = `${providerId}/${modelId}`.toLowerCase();
  return (
    /deepseek.*(?:r1|reasoner|v4|v3[._-]?[12])/.test(value) ||
    /(?:^|[/:._-])r1(?:$|[/:._-])/.test(value) ||
    value.includes("reasoning") ||
    value.includes("thinking") ||
    value.includes("qwq") ||
    value.includes("qwen3") ||
    value.includes("glm-4.6")
  );
}

function sanitizeModel(entry) {
  if (!entry || typeof entry !== "object") return null;
  const providerId = safeString(entry.providerId || entry.provider);
  const modelId = safeString(entry.modelId || entry.model);
  if (!providerId || !modelId) return null;
  const explicitThinking = typeof entry.thinking === "boolean";
  const explicitEnabled = typeof entry.enabled === "boolean";

  return {
    id: `${providerId}/${modelId}`,
    providerId,
    modelId,
    label: safeString(entry.label),
    apiKey: safeString(entry.apiKey),
    baseURL: safeString(entry.baseURL),
    enabled: explicitEnabled ? entry.enabled : true,
    thinking: explicitThinking ? entry.thinking : inferThinkingDefault(providerId, modelId),
    addedAt: Number.isFinite(entry.addedAt) ? entry.addedAt : Date.now(),
    updatedAt: Number.isFinite(entry.updatedAt) ? entry.updatedAt : Date.now(),
  };
}

function sanitizeState(state) {
  const seen = new Set();
  const models = [];

  for (const raw of Array.isArray(state?.models) ? state.models : []) {
    const model = sanitizeModel(raw);
    if (!model || seen.has(model.id)) continue;
    seen.add(model.id);
    models.push(model);
  }

  return {
    ...DEFAULT_STATE,
    models,
  };
}

export function loadOpenCodeState() {
  if (typeof window === "undefined" || !window.localStorage) return { ...DEFAULT_STATE };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    return sanitizeState(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function saveOpenCodeState(patch) {
  const current = loadOpenCodeState();
  const next = sanitizeState({
    ...current,
    ...(patch || {}),
  });

  if (typeof window !== "undefined" && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  return next;
}

export function upsertOpenCodeModel(entry) {
  const current = loadOpenCodeState();
  const incoming = sanitizeModel({
    ...entry,
    updatedAt: Date.now(),
  });
  if (!incoming) return current;

  const existing = current.models.find((model) => model.id === incoming.id);
  const nextModel = {
    ...existing,
    ...incoming,
    addedAt: existing?.addedAt || incoming.addedAt || Date.now(),
    updatedAt: Date.now(),
  };
  const models = existing
    ? current.models.map((model) => (model.id === incoming.id ? nextModel : model))
    : [nextModel, ...current.models];

  return saveOpenCodeState({ models });
}

export function removeOpenCodeModel(modelKey) {
  const current = loadOpenCodeState();
  return saveOpenCodeState({
    models: current.models.filter((model) => model.id !== modelKey),
  });
}

export function openCodeEntryToModel(entry) {
  const providerId = safeString(entry?.providerId);
  const modelId = safeString(entry?.modelId);
  if (!providerId || !modelId) return null;
  if (entry?.enabled === false) return null;

  const label = safeString(entry.label) || `${providerId}/${modelId}`;
  return {
    id: `opencode:${providerId}/${modelId}`,
    name: label,
    tag: label.toUpperCase(),
    provider: "opencode",
    cliFlag: `${providerId}/${modelId}`,
    providerId,
    modelId,
    apiKey: safeString(entry.apiKey),
    baseURL: safeString(entry.baseURL),
    thinking: Boolean(entry.thinking),
  };
}
