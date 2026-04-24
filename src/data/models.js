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

export const getM = (id) =>
  MODELS.find((m) => m.id === normalizeModelId(id)) ||
  MODELS.find((m) => m.id === DEFAULT_MODEL_ID) ||
  MODELS[0];

export function isMulticaModelId(id) {
  return typeof id === "string" && id.startsWith("multica:");
}

export { isByokModelId, parseByokModelId } from "./byok-models";

export function getModelFallback(id, extraModels) {
  if (isMulticaModelId(id)) {
    const hit = extraModels?.find((m) => m.id === id);
    if (hit) return hit;
    return { id, name: "Multica agent", tag: "MULTICA", provider: "multica" };
  }
  if (typeof id === "string" && id.startsWith("byok:")) {
    const hit = extraModels?.find((m) => m.id === id);
    if (hit) return hit;
    return { id, name: "BYOK model", tag: "BYOK", provider: "byok" };
  }
  return getM(id);
}

// Legacy alias
export const getMOrMulticaFallback = getModelFallback;
