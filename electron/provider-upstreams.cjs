const CLAUDE_AUTH_FIELDS = new Set(["ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_API_KEY"]);
const CODEX_WIRE_APIS = new Set(["responses", "chat"]);

function safeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeProviderUpstreamConfig(input, provider) {
  if (!input || typeof input !== "object") return null;
  const normalizedProvider = safeString(input.provider || provider).toLowerCase();
  if (provider && normalizedProvider !== provider) return null;

  const baseURL = safeString(input.baseURL || input.baseUrl);
  const apiKey = safeString(input.apiKey);
  const model = safeString(input.model);
  if (!baseURL && !apiKey && !model) return null;

  const authField = CLAUDE_AUTH_FIELDS.has(input.authField)
    ? input.authField
    : "ANTHROPIC_AUTH_TOKEN";
  const wireApi = CODEX_WIRE_APIS.has(input.wireApi) ? input.wireApi : "responses";

  return {
    provider: normalizedProvider,
    profileId: safeString(input.profileId || input.id),
    name: safeString(input.name),
    baseURL,
    apiKey,
    model,
    authField,
    wireApi,
  };
}

function buildClaudeUpstreamEnv(input) {
  const config = normalizeProviderUpstreamConfig(input, "claude");
  if (!config) return {};

  const env = {};
  if (config.baseURL) env.ANTHROPIC_BASE_URL = config.baseURL;
  if (config.apiKey) {
    env.ANTHROPIC_AUTH_TOKEN = "";
    env.ANTHROPIC_API_KEY = "";
    env[config.authField] = config.apiKey;
  }
  if (config.model) {
    env.ANTHROPIC_MODEL = config.model;
    env.ANTHROPIC_REASONING_MODEL = config.model;
    env.ANTHROPIC_DEFAULT_HAIKU_MODEL = config.model;
    env.ANTHROPIC_DEFAULT_SONNET_MODEL = config.model;
    env.ANTHROPIC_DEFAULT_OPUS_MODEL = config.model;
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

  const key = cleanCodexProviderKey(config.profileId || config.name || config.baseURL);
  const displayName = config.name || key;
  args.push("-c", `model_provider=${JSON.stringify(key)}`);
  args.push("-c", `model_providers.${key}.name=${JSON.stringify(displayName)}`);
  args.push("-c", `model_providers.${key}.base_url=${JSON.stringify(config.baseURL)}`);
  args.push("-c", `model_providers.${key}.wire_api=${JSON.stringify(config.wireApi)}`);
  args.push("-c", `model_providers.${key}.requires_openai_auth=true`);
  return { ...config, providerKey: key };
}

function buildCodexUpstreamEnv(input) {
  const config = normalizeProviderUpstreamConfig(input, "codex");
  if (!config?.apiKey) return {};
  return { OPENAI_API_KEY: config.apiKey };
}

function getCodexUpstreamModel(input) {
  const config = normalizeProviderUpstreamConfig(input, "codex");
  return config?.model || "";
}

function summarizeProviderUpstream(input, provider) {
  const config = normalizeProviderUpstreamConfig(input, provider);
  if (!config) return null;
  return {
    provider: config.provider,
    profileId: config.profileId || null,
    name: config.name || null,
    hasBaseURL: Boolean(config.baseURL),
    hasApiKey: Boolean(config.apiKey),
    hasModel: Boolean(config.model),
    authField: provider === "claude" ? config.authField : undefined,
    wireApi: provider === "codex" ? config.wireApi : undefined,
  };
}

module.exports = {
  buildClaudeUpstreamEnv,
  appendCodexUpstreamArgs,
  buildCodexUpstreamEnv,
  getCodexUpstreamModel,
  normalizeProviderUpstreamConfig,
  summarizeProviderUpstream,
};
