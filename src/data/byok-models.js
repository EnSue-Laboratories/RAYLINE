// BYOK (Bring Your Own Key) model presets and helpers.
// Model IDs follow the format: "byok:{endpoint}:{modelId}"
// where `endpoint` matches a provider ID from byok-store (e.g. "anthropic", "openai", "custom-xxx").

export const BYOK_PRESETS = [
  // Anthropic
  { id: "byok:anthropic:claude-opus-4-20250514",  name: "Claude Opus 4 (API)",  tag: "OPUS 4",  provider: "byok", endpoint: "anthropic", modelId: "claude-opus-4-20250514",  contextWindow: 200_000 },
  { id: "byok:anthropic:claude-sonnet-4-20250514", name: "Claude Sonnet 4 (API)", tag: "SONNET 4", provider: "byok", endpoint: "anthropic", modelId: "claude-sonnet-4-20250514", contextWindow: 200_000 },

  // OpenAI
  { id: "byok:openai:gpt-4o",   name: "GPT-4o (API)",   tag: "GPT-4O",   provider: "byok", endpoint: "openai", modelId: "gpt-4o",   contextWindow: 128_000 },
  { id: "byok:openai:gpt-4.1",  name: "GPT-4.1 (API)",  tag: "GPT-4.1",  provider: "byok", endpoint: "openai", modelId: "gpt-4.1",  contextWindow: 1_047_576 },
  { id: "byok:openai:o3",       name: "o3 (API)",        tag: "O3",       provider: "byok", endpoint: "openai", modelId: "o3",       contextWindow: 200_000 },
  { id: "byok:openai:o4-mini",  name: "o4-mini (API)",   tag: "O4-MINI",  provider: "byok", endpoint: "openai", modelId: "o4-mini",  contextWindow: 200_000 },

  // DeepSeek
  { id: "byok:deepseek:deepseek-v4-flash", name: "DeepSeek v4 Flash", tag: "DS-V4", provider: "byok", endpoint: "deepseek", modelId: "deepseek-v4-flash", contextWindow: 128_000 },
  { id: "byok:deepseek:deepseek-chat",     name: "DeepSeek Chat",     tag: "DS-CHAT", provider: "byok", endpoint: "deepseek", modelId: "deepseek-chat", contextWindow: 128_000 },

  // OpenCode Specialized Agents
  { id: "byok:opencode-cli:coder",       name: "OpenCode Coder Agent",       tag: "CODER", provider: "byok", endpoint: "opencode-cli", modelId: "coder", contextWindow: 128_000 },
  { id: "byok:opencode-cli:researcher",  name: "OpenCode Researcher Agent",  tag: "RESEARCH", provider: "byok", endpoint: "opencode-cli", modelId: "researcher", contextWindow: 128_000 },
  { id: "byok:opencode-cli:interpreter", name: "OpenCode Interpreter Agent", tag: "INTERPRET", provider: "byok", endpoint: "opencode-cli", modelId: "open-interpreter", contextWindow: 128_000 },
];

export function isByokModelId(id) {
  return typeof id === "string" && id.startsWith("byok:");
}

export function parseByokModelId(id) {
  if (!isByokModelId(id)) return null;
  const parts = id.split(":");
  if (parts.length < 3) return null;
  // endpoint is parts[1], modelId is everything after (may contain colons)
  return { endpoint: parts[1], modelId: parts.slice(2).join(":") };
}

export function buildByokModelId(endpoint, modelId) {
  return `byok:${endpoint}:${modelId}`;
}

export function buildCustomByokModel({ endpoint, modelId, name, contextWindow = 128_000 }) {
  return {
    id: buildByokModelId(endpoint, modelId),
    name: name || `${modelId} (API)`,
    tag: modelId.toUpperCase(),
    provider: "byok",
    endpoint,
    modelId,
    contextWindow,
  };
}

export function getByokPresetsForEndpoints(endpointIds) {
  if (!endpointIds || endpointIds.length === 0) return [];
  const idSet = new Set(endpointIds);
  return BYOK_PRESETS.filter((m) => idSet.has(m.endpoint));
}
