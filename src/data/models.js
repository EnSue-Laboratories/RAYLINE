export const DEFAULT_MODEL_ID = "sonnet";

const LEGACY_MODEL_IDS = {
  haiku: DEFAULT_MODEL_ID,
};

export const MODELS = [
  { id: "opus",   name: "Claude Opus",   tag: "OPUS",   cliFlag: "opus",   provider: "claude" },
  { id: "sonnet", name: "Claude Sonnet", tag: "SONNET", cliFlag: "sonnet", provider: "claude" },
  { id: "gpt54-med",   name: "GPT-5.4",        tag: "GPT-5.4",       cliFlag: "gpt-5.4", provider: "codex", effort: "medium" },
  { id: "gpt54-high",  name: "GPT-5.4 High",   tag: "GPT-5.4 HIGH",  cliFlag: "gpt-5.4", provider: "codex", effort: "high" },
  { id: "gpt54-xhigh", name: "GPT-5.4 XHigh",  tag: "GPT-5.4 XHIGH", cliFlag: "gpt-5.4", provider: "codex", effort: "xhigh" },
];

export const normalizeModelId = (id) => LEGACY_MODEL_IDS[id] || id;

export const getM = (id) =>
  MODELS.find((m) => m.id === normalizeModelId(id)) ||
  MODELS.find((m) => m.id === DEFAULT_MODEL_ID) ||
  MODELS[0];
