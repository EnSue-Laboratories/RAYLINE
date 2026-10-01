/** Per-run agent options derived from a resolved model definition. */

import type { ModelDefinition } from "@shared/models/types";
import { getRemoteRuntimeConfig } from "@shared/models/dynamic-models";
import {
  getRuntimeProviderForProvider,
  type ModelProviderId,
  type OpenCodeRuntimeConfig,
  type ProviderUpstreamConfig,
  type RemoteRuntimeConfig,
  type RuntimeProviderId,
  type UpstreamProviderId,
} from "@shared/providers/types";

export function getRuntimeProviderForModel(model: ModelDefinition): RuntimeProviderId {
  return "runtimeProvider" in model ? model.runtimeProvider : getRuntimeProviderForProvider(model.provider);
}

export function getRemoteRuntimeConfigForModel(model: ModelDefinition): RemoteRuntimeConfig | undefined {
  return "remoteRuntime" in model ? getRemoteRuntimeConfig(model) : undefined;
}

export function getModelThinkingValue(model: ModelDefinition): boolean | undefined {
  return typeof model.thinking === "boolean" ? model.thinking : undefined;
}

export function getOpenCodeRuntimeConfig(model: ModelDefinition): OpenCodeRuntimeConfig | undefined {
  if (model.provider !== "opencode") return undefined;
  // Dynamic models come from localStorage; keep the defensive string checks.
  return {
    providerId: typeof model.providerId === "string" ? model.providerId : "",
    modelId: typeof model.modelId === "string" ? model.modelId : "",
    apiKey: typeof model.apiKey === "string" ? model.apiKey : "",
    baseURL: typeof model.baseURL === "string" ? model.baseURL : "",
  };
}

function isUpstreamProvider(provider: RuntimeProviderId): provider is UpstreamProviderId {
  return provider === "claude" || provider === "codex";
}

export function getProviderUpstreamRuntimeConfig(
  provider: ModelProviderId,
  getActiveConfig: (provider: UpstreamProviderId) => ProviderUpstreamConfig | null,
): ProviderUpstreamConfig | undefined {
  if (provider === "multica" || provider === "opencode") return undefined;
  const runtimeProvider = getRuntimeProviderForProvider(provider);
  if (!isUpstreamProvider(runtimeProvider)) return undefined;
  return getActiveConfig(runtimeProvider) ?? undefined;
}
