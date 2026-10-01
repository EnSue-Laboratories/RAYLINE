/**
 * Pure OpenCode config logic (~/.config/opencode/opencode.json and the auth
 * store): status derivation, input validation and config patching.
 */

import type {
  OpenCodeProviderConfig,
  OpenCodeSaveConfigInput,
  OpenCodeStatusSnapshot,
} from "@shared/providers/types";

export type JsonObject = Record<string, unknown>;

const PROVIDER_ID_RE = /^[a-zA-Z0-9_.-]+$/;

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function objectOrEmpty(value: unknown): JsonObject {
  return isJsonObject(value) ? value : {};
}

/** Provider ids present in OpenCode's auth.json (several historical layouts). */
export function collectAuthProviders(authConfig: unknown): string[] {
  if (!isJsonObject(authConfig)) return [];
  if (isJsonObject(authConfig.provider)) return Object.keys(authConfig.provider);
  if (isJsonObject(authConfig.providers)) return Object.keys(authConfig.providers);
  return Object.keys(authConfig).filter((key) => isJsonObject(authConfig[key]));
}

export function hasProviderCredential(providerConfig: JsonObject, authProviders: readonly string[]): boolean {
  const providerIds = Object.keys(providerConfig);
  if (providerIds.some((provider) => authProviders.includes(provider))) return true;
  return providerIds.some((provider) => {
    const apiKey = objectOrEmpty(objectOrEmpty(providerConfig[provider]).options).apiKey;
    return typeof apiKey === "string" && apiKey.trim().length > 0;
  });
}

export interface OpenCodeStatusInputs {
  binPath: string | null;
  configPath: string;
  authPath: string;
  config: unknown;
  auth: unknown;
  configExists: boolean;
  authExists: boolean;
}

export function buildOpenCodeStatusSnapshot(inputs: OpenCodeStatusInputs): OpenCodeStatusSnapshot {
  const config = objectOrEmpty(inputs.config);
  const providerConfig = objectOrEmpty(config.provider);
  const authProviders = collectAuthProviders(inputs.auth);
  const providers = [...new Set([...Object.keys(providerConfig), ...authProviders])].sort();
  const configured = Boolean(
    inputs.binPath &&
    providers.length > 0 &&
    config.model &&
    hasProviderCredential(providerConfig, authProviders),
  );
  return {
    installed: Boolean(inputs.binPath),
    configured,
    binPath: inputs.binPath ?? "",
    configPath: inputs.configPath,
    configExists: inputs.configExists,
    authPath: inputs.authPath,
    authExists: inputs.authExists,
    model: typeof config.model === "string" ? config.model : "",
    smallModel: typeof config.small_model === "string" ? config.small_model : "",
    providers,
  };
}

/** Provider ids from `opencode models` output (`provider/model` per line). */
export function parseOpenCodeModelProviders(output: string): string[] {
  const providers = new Set<string>();
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    const slashIndex = line.indexOf("/");
    if (slashIndex <= 0) continue;
    const providerId = line.slice(0, slashIndex).trim();
    if (PROVIDER_ID_RE.test(providerId)) providers.add(providerId);
  }
  return [...providers].sort((a, b) => a.localeCompare(b));
}

export interface NormalizedOpenCodeConfigInput {
  providerId: string;
  modelId: string;
  apiKey: string;
  baseURL: string;
  setDefault: boolean;
}

/** Validates `opencode-save-config` input; throws a user-facing Error when invalid. */
export function normalizeOpenCodeConfigInput(input: Partial<OpenCodeSaveConfigInput> | null | undefined): NormalizedOpenCodeConfigInput {
  const providerId = typeof input?.providerId === "string" ? input.providerId.trim() : "";
  const modelId = typeof input?.modelId === "string" ? input.modelId.trim() : "";
  if (!providerId || !PROVIDER_ID_RE.test(providerId)) {
    throw new Error("Provider ID must contain only letters, numbers, dots, underscores, or hyphens.");
  }
  if (!modelId || /[\r\n]/.test(modelId)) {
    throw new Error("Model ID is required.");
  }
  return {
    providerId,
    modelId,
    apiKey: typeof input?.apiKey === "string" ? input.apiKey.trim() : "",
    baseURL: typeof input?.baseURL === "string" ? input.baseURL.trim() : "",
    setDefault: input?.setDefault !== false,
  };
}

/** apiKey / baseURL of one provider entry in the config (empty strings when absent). */
export function extractProviderConfig(config: unknown, providerId: string): OpenCodeProviderConfig {
  const id = providerId.trim();
  if (!id || !PROVIDER_ID_RE.test(id)) return { apiKey: "", baseURL: "" };
  const options = objectOrEmpty(objectOrEmpty(objectOrEmpty(objectOrEmpty(config).provider)[id]).options);
  return {
    apiKey: typeof options.apiKey === "string" ? options.apiKey : "",
    baseURL: typeof options.baseURL === "string" ? options.baseURL : "",
  };
}

/**
 * Registers the model under its provider (keeping existing provider /
 * model settings) and optionally makes it the default model.
 */
export function applyOpenCodeConfigInput(existing: unknown, input: NormalizedOpenCodeConfigInput): JsonObject {
  const config = objectOrEmpty(existing);
  const provider: JsonObject = { ...objectOrEmpty(config.provider) };
  const currentProvider: JsonObject = { ...objectOrEmpty(provider[input.providerId]) };
  const models: JsonObject = { ...objectOrEmpty(currentProvider.models) };
  const options: JsonObject = { ...objectOrEmpty(currentProvider.options) };

  models[input.modelId] = objectOrEmpty(models[input.modelId]);
  provider[input.providerId] = {
    ...currentProvider,
    models,
    ...(Object.keys(options).length > 0 ? { options } : {}),
  };

  return {
    $schema: typeof config.$schema === "string" && config.$schema ? config.$schema : "https://opencode.ai/config.json",
    ...config,
    provider,
    ...(input.setDefault ? { model: `${input.providerId}/${input.modelId}` } : {}),
  };
}
