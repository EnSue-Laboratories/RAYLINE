/**
 * SSH-remote model helpers for the renderer. Model building, id formats and
 * provider mapping live in @shared/models / @shared/providers; this module
 * binds them to the built-in catalogue and accepts the loosely-typed values
 * App still passes around.
 */

import {
  buildRemoteModels as buildSharedRemoteModels,
  getRemoteRuntimeConfig as getSharedRemoteRuntimeConfig,
  MODELS,
  type ModelDefinition,
  type RemoteModelDefinition,
} from "@shared/models";
import {
  getRuntimeProviderForProvider as getSharedRuntimeProviderForProvider,
  isModelProviderId,
  isRemoteModelProviderId,
  REMOTE_PROVIDER_BY_PROVIDER,
  type ModelProviderId,
  type RemoteModelProviderId,
  type RemoteRuntimeConfig,
  type RemoteSshRuntimeState,
  type RuntimeProviderId,
} from "@shared/providers/types";

export { REMOTE_PROVIDER_BY_PROVIDER };

export function isRemoteModelProvider(provider: unknown): provider is RemoteModelProviderId {
  return isRemoteModelProviderId(provider);
}

/** `remote-claude` → `claude`; other values are returned unchanged. */
export function getRuntimeProviderForProvider(provider: ModelProviderId): RuntimeProviderId;
export function getRuntimeProviderForProvider<T>(provider: T): T | RuntimeProviderId;
export function getRuntimeProviderForProvider(provider: unknown): unknown {
  return isModelProviderId(provider) ? getSharedRuntimeProviderForProvider(provider) : provider;
}

type ModelLike = Pick<ModelDefinition, "provider"> & { runtimeProvider?: RuntimeProviderId };

/** Backend that actually runs `model` (`runtimeProvider` for remote models). */
export function getRuntimeProviderForModel(model: ModelLike | null | undefined): RuntimeProviderId | undefined {
  if (!model) return undefined;
  return model.runtimeProvider || getSharedRuntimeProviderForProvider(model.provider);
}

function isRemoteModel(model: ModelDefinition): model is RemoteModelDefinition {
  return isRemoteModelProviderId(model.provider);
}

/** `remoteRuntime` to send with `agent-start`, or undefined for local models. */
export function getRemoteRuntimeConfig(model: ModelDefinition | null | undefined): RemoteRuntimeConfig | undefined {
  if (!model || !isRemoteModel(model)) return undefined;
  return getSharedRemoteRuntimeConfig(model);
}

/** SSH copies of the built-in Claude/Codex models the last probe found on the host. */
export function buildRemoteModels(
  sshCommand: string,
  runtime: RemoteSshRuntimeState | null = null,
): RemoteModelDefinition[] {
  return buildSharedRemoteModels(sshCommand, runtime, MODELS);
}
