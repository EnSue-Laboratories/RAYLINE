const STORAGE_KEY = "rayline.opencode.v1";

const DEFAULT_STATE = {
  models: [],
};

function safeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeModel(entry) {
  if (!entry || typeof entry !== "object") return null;
  const providerId = safeString(entry.providerId || entry.provider);
  const modelId = safeString(entry.modelId || entry.model);
  if (!providerId || !modelId) return null;

  const contextWindow = Number(entry.contextWindow);
  return {
    id: `${providerId}/${modelId}`,
    providerId,
    modelId,
    label: safeString(entry.label),
    baseURL: safeString(entry.baseURL),
    contextWindow: Number.isFinite(contextWindow) && contextWindow > 0
      ? Math.round(contextWindow)
      : null,
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
  const models = [
    {
      ...existing,
      ...incoming,
      addedAt: existing?.addedAt || incoming.addedAt || Date.now(),
      updatedAt: Date.now(),
    },
    ...current.models.filter((model) => model.id !== incoming.id),
  ];

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

  const label = safeString(entry.label) || `${providerId}/${modelId}`;
  return {
    id: `opencode:${providerId}/${modelId}`,
    name: label,
    tag: label.toUpperCase(),
    provider: "opencode",
    cliFlag: `${providerId}/${modelId}`,
    providerId,
    modelId,
    ...(entry.contextWindow ? { contextWindow: entry.contextWindow } : {}),
  };
}
