function safeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeProviderUpstreamConfig(input, provider) {
  if (!input || typeof input !== "object") return null;
  const normalizedProvider = safeString(input.provider || provider).toLowerCase();
  if (provider && normalizedProvider !== provider) return null;

  const baseURL = safeString(input.baseURL || input.baseUrl);
  const apiKey = safeString(input.apiKey);
  const modelList = Array.isArray(input.modelList)
    ? input.modelList.map((model) => safeString(model)).filter(Boolean)
    : [];
  if (!baseURL && !apiKey && modelList.length === 0) return null;

  return {
    provider: normalizedProvider,
    baseURL,
    apiKey,
    modelList,
  };
}

function buildClaudeUpstreamEnv(input) {
  const config = normalizeProviderUpstreamConfig(input, "claude");
  if (!config) return {};

  const env = {};
  if (config.baseURL) env.ANTHROPIC_BASE_URL = config.baseURL;
  if (config.apiKey) {
    env.ANTHROPIC_AUTH_TOKEN = config.apiKey;
    env.ANTHROPIC_API_KEY = "";
  }
  return env;
}

function cleanCodexProviderKey(raw) {
  const cleaned = safeString(raw)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || "rayline";
}

function appendCodexUpstreamArgs(args, input) {
  const config = normalizeProviderUpstreamConfig(input, "codex");
  if (!config || !config.baseURL) return null;

  const key = cleanCodexProviderKey(config.baseURL);
  args.push("-c", `model_provider=${JSON.stringify(key)}`);
  args.push("-c", `model_providers.${key}.name=${JSON.stringify(key)}`);
  args.push("-c", `model_providers.${key}.base_url=${JSON.stringify(config.baseURL)}`);
  args.push("-c", `model_providers.${key}.wire_api=${JSON.stringify("responses")}`);
  args.push("-c", `model_providers.${key}.requires_openai_auth=true`);
  return { ...config, providerKey: key };
}

function buildCodexUpstreamEnv(input) {
  const config = normalizeProviderUpstreamConfig(input, "codex");
  if (!config?.apiKey) return {};
  return { OPENAI_API_KEY: config.apiKey };
}

function summarizeProviderUpstream(input, provider) {
  const config = normalizeProviderUpstreamConfig(input, provider);
  if (!config) return null;
  return {
    provider: config.provider,
    hasBaseURL: Boolean(config.baseURL),
    hasApiKey: Boolean(config.apiKey),
    modelCount: config.modelList.length,
  };
}

module.exports = {
  buildClaudeUpstreamEnv,
  appendCodexUpstreamArgs,
  buildCodexUpstreamEnv,
  normalizeProviderUpstreamConfig,
  summarizeProviderUpstream,
};
