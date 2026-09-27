import codexCatalog from "./codexModelCatalog.json" with { type: "json" };

export const DEFAULT_MODEL_ID = "sonnet";
const CODEX_CONTEXT_WINDOW = 272_000;
const GROK_CONTEXT_WINDOW = 500_000;
const LEGACY_MODEL_IDS = {};

export function codexModelId(slug, effort) {
  const known = /^gpt-(5\.[456]|6)-(astra|sol|luna|terra)$/.exec(slug);
  const plain = /^gpt-(5\.[45])$/.exec(slug);
  const suffix = effort === "medium" ? "med" : effort;
  if (known) return `gpt${known[1].replace(".", "")}-${known[2]}-${suffix}`;
  if (plain) return `gpt${plain[1].replace(".", "")}-${suffix}`;
  return `codex-model:${encodeURIComponent(slug)}:${effort}`;
}

export function buildCodexModels(records = []) {
  return records.flatMap((record) => {
    if (!record?.slug || record.visibility === "hide") return [];
    const efforts = (record.supported_reasoning_levels || ["medium"])
      .map((level) => typeof level === "string" ? level : level?.effort)
      .filter((level) => ["none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"].includes(level));
    const defaultEffort = record.default_reasoning_level || "medium";
    return [...new Set(efforts)].sort((a, b) => (a === defaultEffort ? -1 : b === defaultEffort ? 1 : 0)).map((effort) => ({
      id: codexModelId(record.slug, effort),
      name: record.display_name || record.slug,
      tag: record.display_name || record.slug,
      cliFlag: record.slug,
      provider: "codex",
      effort,
      contextWindow: record.context_window || CODEX_CONTEXT_WINDOW,
    }));
  });
}

const grokModel = (id, name, cliFlag, extra = {}) => ({
  id, name, tag: name.toUpperCase(), cliFlag, provider: "grok",
  contextWindow: GROK_CONTEXT_WINDOW, ...extra,
});

export const MODELS = [
  // CLI aliases follow the installed provider/account rather than pinning old versions.
  { id: "opus", name: "Claude Opus", tag: "OPUS", cliFlag: "opus", provider: "claude", contextWindow: 1_000_000 },
  { id: "opus-1m", name: "Claude Opus (1M)", tag: "OPUS 1M", cliFlag: "opus[1m]", provider: "claude", contextWindow: 1_000_000 },
  { id: "sonnet", name: "Claude Sonnet", tag: "SONNET", cliFlag: "sonnet", provider: "claude", contextWindow: 1_000_000 },
  { id: "sonnet-1m", name: "Claude Sonnet (1M)", tag: "SONNET 1M", cliFlag: "sonnet[1m]", provider: "claude", contextWindow: 1_000_000 },
  { id: "haiku", name: "Claude Haiku", tag: "HAIKU", cliFlag: "haiku", provider: "claude", contextWindow: 200_000 },
  { id: "fable", name: "Claude Fable", tag: "FABLE", cliFlag: "fable", provider: "claude", contextWindow: 1_000_000 },
  ...buildCodexModels(codexCatalog.models),
  ...["medium", "high", "xhigh"].map((effort) => ({
    id: codexModelId("gpt-5.4", effort), name: "GPT-5.4", tag: "GPT-5.4", cliFlag: "gpt-5.4", provider: "codex", effort,
    contextWindow: 1_050_000, legacy: true,
  })),
  grokModel("grok-47", "Grok 4.7", "grok-4.7"),
  grokModel("grok-46", "Grok 4.6", "grok-4.6"),
  grokModel("grok-46-continue", "Grok 4.6", "grok-4.6", { grokContinue: true }),
  grokModel("grok-46-direct", "Grok 4.6 Direct", "grok-4.6-direct", { legacy: true }),
  grokModel("grok-46-public", "Grok 4.6 Public", "grok-4.6-public", { legacy: true }),
  grokModel("grok-45", "Grok 4.5", "grok-4.5"),
  grokModel("grok-43", "Grok 4.3", "grok-4.3", { contextWindow: 1_000_000 }),
  grokModel("grok-420-0309-reasoning", "Grok 4.20 Reasoning", "grok-4.20-0309-reasoning", { contextWindow: 1_000_000 }),
  grokModel("grok-420-0309-non-reasoning", "Grok 4.20 Non-reasoning", "grok-4.20-0309-non-reasoning", { contextWindow: 1_000_000 }),
  grokModel("grok-build-01", "Grok Build 0.1", "grok-build-0.1", { contextWindow: 256_000 }),
  grokModel("grok-420-reasoning", "Grok 4.20 Reasoning (CLI alias)", "grok-4.20-reasoning", { legacy: true, contextWindow: 1_000_000 }),
  grokModel("grok-build-latest", "Grok Build latest", "grok-build-latest", { legacy: true, contextWindow: null }),
];

export function buildRuntimeModels(catalog = {}) {
  const codex = buildCodexModels(catalog.codex);
  const grok = (catalog.grok || []).filter((slug) => typeof slug === "string" && /^grok-[a-z0-9._-]+$/i.test(slug)).map((slug) => {
    const known = MODELS.find((m) => m.provider === "grok" && m.cliFlag === slug && !m.grokContinue);
    return known ? { ...known, legacy: false } : grokModel(slug, slug, slug, { contextWindow: null });
  });
  return [...codex, ...grok].map((model) => ({ ...model, runtimeCatalog: true }));
}

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
  const runtimeSlugs = new Set((extraModels || []).filter((m) => m.runtimeCatalog).map((m) => `${m.provider}:${m.cliFlag}`));
  const candidates = [
    ...MODELS.filter((m) => !overrides.has(m.provider) && (m.grokContinue || !runtimeSlugs.has(`${m.provider}:${m.cliFlag}`))),
    ...(extraModels || []).filter((m) => !m.runtimeCatalog || !overrides.has(m.provider)),
  ];
  return [...new Map(candidates.map((m) => [m.id, m])).values()];
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
      contextWindow: parsed.provider === "codex" ? CODEX_CONTEXT_WINDOW : 200_000,
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

export function isGrokModelId(id) {
  return typeof id === "string" && id.startsWith("grok");
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
  if (baseHit) return baseHit;
  if (typeof id === "string" && id.startsWith("codex-model:")) {
    const [, encoded, effort] = id.split(":");
    try {
      const cliFlag = decodeURIComponent(encoded);
      return { id, name: cliFlag, tag: cliFlag, cliFlag, effort, provider: "codex", contextWindow: CODEX_CONTEXT_WINDOW };
    } catch { /* Use the normal fallback for malformed historical IDs. */ }
  }
  if (isGrokModelId(id)) {
    return { id, name: "Grok", tag: "GROK", provider: "grok", cliFlag: id, contextWindow: null };
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
