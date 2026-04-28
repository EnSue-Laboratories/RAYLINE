export const DEFAULT_MODEL_ID = "sonnet";

const LEGACY_MODEL_IDS = {
  haiku: DEFAULT_MODEL_ID,
};

// `contextWindow` is the model's total usable context in tokens — used by the
// loading footer to turn raw usage counts into a "% of window full" reading.
export const MODELS = [
  { id: "opus",    name: "Claude Opus",      tag: "OPUS",    cliFlag: "opus",     provider: "claude", contextWindow: 200_000 },
  { id: "opus-1m", name: "Claude Opus (1M)", tag: "OPUS 1M", cliFlag: "opus[1m]", provider: "claude", contextWindow: 1_000_000 },
  { id: "sonnet",  name: "Claude Sonnet",    tag: "SONNET",  cliFlag: "sonnet",   provider: "claude", contextWindow: 200_000 },
  { id: "gpt55-med",   name: "GPT-5.5",         tag: "GPT-5.5",        cliFlag: "gpt-5.5", provider: "codex", effort: "medium", contextWindow: 1_050_000 },
  { id: "gpt55-high",  name: "GPT-5.5 high",    tag: "GPT-5.5 high",   cliFlag: "gpt-5.5", provider: "codex", effort: "high",   contextWindow: 1_050_000 },
  { id: "gpt55-xhigh", name: "GPT-5.5 xhigh",   tag: "GPT-5.5 xhigh",  cliFlag: "gpt-5.5", provider: "codex", effort: "xhigh",  contextWindow: 1_050_000 },
  { id: "gpt54-med",   name: "GPT-5.4",         tag: "GPT-5.4",        cliFlag: "gpt-5.4", provider: "codex", effort: "medium", contextWindow: 1_050_000 },
  { id: "gpt54-high",  name: "GPT-5.4 high",    tag: "GPT-5.4 high",   cliFlag: "gpt-5.4", provider: "codex", effort: "high",   contextWindow: 1_050_000 },
  { id: "gpt54-xhigh", name: "GPT-5.4 xhigh",   tag: "GPT-5.4 xhigh",  cliFlag: "gpt-5.4", provider: "codex", effort: "xhigh",  contextWindow: 1_050_000 },
];

export const normalizeModelId = (id) => LEGACY_MODEL_IDS[id] || id;

function modelTag(modelId) {
  const compact = String(modelId || "").split("/").pop() || modelId;
  return String(compact || "model").replace(/[^a-z0-9._-]+/gi, " ").trim().toUpperCase() || "MODEL";
}

export function isProviderUpstreamModelId(id) {
  return typeof id === "string" && id.startsWith("provider-upstream:");
}

export function parseProviderUpstreamModelId(id) {
  if (!isProviderUpstreamModelId(id)) return null;
  const value = id.slice("provider-upstream:".length);
  const splitIndex = value.indexOf(":");
  if (splitIndex <= 0 || splitIndex >= value.length - 1) return null;
  const provider = value.slice(0, splitIndex);
  const modelId = value.slice(splitIndex + 1);
  if (provider !== "claude" && provider !== "codex") return null;
  return { provider, modelId };
}

export function getAvailableModels(extraModels = []) {
  const overrides = new Set(
    (extraModels || [])
      .filter((m) => m?.providerOverride && m.provider)
      .map((m) => m.provider)
  );
  return [
    ...MODELS.filter((m) => !overrides.has(m.provider)),
    ...(extraModels || []),
  ];
}

export const getM = (id) => {
  const parsed = parseProviderUpstreamModelId(id);
  if (parsed) {
    return {
      id,
      name: parsed.modelId,
      tag: modelTag(parsed.modelId),
      cliFlag: parsed.modelId,
      provider: parsed.provider,
      providerOverride: true,
      contextWindow: parsed.provider === "codex" ? 1_050_000 : 200_000,
    };
  }
  return (
    MODELS.find((m) => m.id === normalizeModelId(id)) ||
    MODELS.find((m) => m.id === DEFAULT_MODEL_ID) ||
    MODELS[0]
  );
};

export function isMulticaModelId(id) {
  return typeof id === "string" && id.startsWith("multica:");
}

export function isOpenCodeModelId(id) {
  return typeof id === "string" && id.startsWith("opencode:");
}

export function parseOpenCodeModelId(id) {
  if (!isOpenCodeModelId(id)) return null;
  const value = id.slice("opencode:".length).trim();
  const slashIndex = value.indexOf("/");
  if (slashIndex <= 0 || slashIndex >= value.length - 1) return null;
  return {
    providerId: value.slice(0, slashIndex),
    modelId: value.slice(slashIndex + 1),
    cliFlag: value,
  };
}

export function getMOrMulticaFallback(id, extraModels = []) {
  const normalizedId = normalizeModelId(id);
  const available = getAvailableModels(extraModels);
  const availableHit = available.find((m) => (
    m.id === id || m.id === normalizedId
  ));
  if (availableHit) return availableHit;
  const baseHit = MODELS.find((m) => m.id === normalizedId);

  if (isMulticaModelId(id)) {
    return { id, name: "Multica agent", tag: "MULTICA", provider: "multica" };
  }
  if (isOpenCodeModelId(id)) {
    const parsed = parseOpenCodeModelId(id);
    if (parsed) {
      return {
        id,
        name: `OpenCode ${parsed.providerId}/${parsed.modelId}`,
        tag: "OPENCODE",
        provider: "opencode",
        cliFlag: parsed.cliFlag,
        providerId: parsed.providerId,
        modelId: parsed.modelId,
      };
    }
  }
  if (isProviderUpstreamModelId(id)) {
    return getM(id);
  }
  return (
    available.find((m) => m.provider === baseHit?.provider) ||
    available[0] ||
    getM(id)
  );
}
