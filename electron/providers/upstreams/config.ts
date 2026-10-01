/**
 * Provider-upstream (custom base URL / API key per CLI) normalization and the
 * pure env / `-c` argument builders derived from it.
 */

import type { ProviderUpstreamConfig, UpstreamProviderId } from "@shared/providers/types";
import { isRecord, safeString } from "../common/json";

export interface ProviderUpstreamSummary {
  provider: UpstreamProviderId;
  hasBaseURL: boolean;
  hasApiKey: boolean;
  modelCount: number;
}

function isUpstreamProviderId(value: string): value is UpstreamProviderId {
  return value === "claude" || value === "codex";
}

/**
 * Validates an upstream config from the renderer. Accepts `baseUrl` as an
 * alias of `baseURL`. Null when invalid, for another provider, or empty.
 */
export function normalizeProviderUpstreamConfig(input: unknown, provider?: UpstreamProviderId): ProviderUpstreamConfig | null {
  if (!isRecord(input)) return null;
  const normalizedProvider = safeString(input.provider || provider).toLowerCase();
  if (provider && normalizedProvider !== provider) return null;
  if (!isUpstreamProviderId(normalizedProvider)) return null;

  const baseURL = safeString(input.baseURL || input.baseUrl);
  const apiKey = safeString(input.apiKey);
  const modelList = Array.isArray(input.modelList) ? input.modelList.map((model) => safeString(model)).filter(Boolean) : [];
  if (!baseURL && !apiKey && modelList.length === 0) return null;

  return { provider: normalizedProvider, baseURL, apiKey, modelList };
}

/** Ensures the URL ends in `/v1` (OpenAI-compatible APIs). */
export function normalizeOpenAIBaseURL(value: unknown): string {
  const raw = safeString(value).replace(/\/+$/, "");
  if (!raw) return "";
  try {
    const url = new URL(raw);
    const pathname = url.pathname.replace(/\/+$/, "");
    if (!pathname || pathname === "/") url.pathname = "/v1";
    else url.pathname = pathname.split("/").pop() !== "v1" ? `${pathname}/v1` : pathname;
    return url.toString().replace(/\/+$/, "");
  } catch {
    return raw;
  }
}

/** Joins `/chat/completions`-style suffixes onto a base URL path. */
export function joinOpenAIPath(baseURL: string, suffixPath: string): string {
  const url = new URL(baseURL);
  const basePath = url.pathname.replace(/\/+$/, "");
  url.pathname = `${basePath}/${safeString(suffixPath).replace(/^\/+/, "")}`;
  return url.toString();
}

/** TOML-safe `model_providers.<key>` name derived from a URL. */
export function cleanCodexProviderKey(raw: unknown): string {
  const cleaned = safeString(raw)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || "rayline";
}

export function buildClaudeUpstreamEnv(input: unknown): Record<string, string> {
  const config = normalizeProviderUpstreamConfig(input, "claude");
  if (!config) return {};
  const env: Record<string, string> = {};
  if (config.baseURL) env.ANTHROPIC_BASE_URL = config.baseURL;
  if (config.apiKey) {
    env.ANTHROPIC_AUTH_TOKEN = config.apiKey;
    env.ANTHROPIC_API_KEY = "";
  }
  return env;
}

/** `-c model_provider…` overrides pointing Codex at `baseURL`. */
export function buildCodexProviderArgs(baseURL: string, models: readonly string[]): string[] {
  const key = cleanCodexProviderKey(baseURL);
  const args = [
    "-c",
    `model_provider=${JSON.stringify(key)}`,
    "-c",
    `model_providers.${key}.name=${JSON.stringify(key)}`,
    "-c",
    `model_providers.${key}.base_url=${JSON.stringify(baseURL)}`,
    "-c",
    `model_providers.${key}.wire_api=${JSON.stringify("responses")}`,
    "-c",
    `model_providers.${key}.env_key=${JSON.stringify("OPENAI_API_KEY")}`,
  ];
  if (models.length > 0) args.push("-c", `model_providers.${key}.models=${JSON.stringify(models)}`);
  return args;
}

/** Upstream model list plus the requested model, de-duplicated. */
export function upstreamModels(config: ProviderUpstreamConfig, model: string | null | undefined): string[] {
  return Array.from(new Set([...config.modelList, model].filter((m): m is string => Boolean(m))));
}

export function buildCodexUpstreamEnv(input: unknown, bridgeApiKey?: string | null): Record<string, string> {
  if (bridgeApiKey) return { OPENAI_API_KEY: bridgeApiKey };
  const config = normalizeProviderUpstreamConfig(input, "codex");
  return config?.apiKey ? { OPENAI_API_KEY: config.apiKey } : {};
}

export function summarizeProviderUpstream(input: unknown, provider: UpstreamProviderId): ProviderUpstreamSummary | null {
  const config = normalizeProviderUpstreamConfig(input, provider);
  if (!config) return null;
  return {
    provider: config.provider,
    hasBaseURL: Boolean(config.baseURL),
    hasApiKey: Boolean(config.apiKey),
    modelCount: config.modelList.length,
  };
}
