/**
 * Model lists published by <ModelsBridge>, which owns the data hooks
 * (shared `useModelCatalog` + Multica / OpenCode / SSH remotes). Handlers read
 * `getModels()` / `resolveModel()`; components subscribe to single fields.
 */

import type {
  ModelDefinition,
  MulticaModelDefinition,
  OpenCodeModelDefinition,
  RemoteModelDefinition,
} from "@shared/models/types";
import type { ProviderUpstreamConfig, UpstreamProviderId } from "@shared/providers/types";
import { getMOrMulticaFallback } from "@shared/models/registry";
import { createStore, useStore } from "../../store/createStore";

export interface ModelsSnapshot {
  multicaModels: readonly MulticaModelDefinition[];
  openCodeModels: readonly OpenCodeModelDefinition[];
  openCodeInstalled: boolean;
  remoteModels: RemoteModelDefinition[];
  /** Everything selectable (catalog: built-ins, runtime discovery, upstreams, extras). */
  availableModels: readonly ModelDefinition[];
  /** Resolve a conversation's (possibly legacy) model id against the catalog. */
  getModel: (id: string | null | undefined) => ModelDefinition;
  refreshOpenCodeModels: () => void;
  getProviderUpstreamConfig: (provider: UpstreamProviderId) => ProviderUpstreamConfig | null;
}

const NO_MODELS: readonly ModelDefinition[] = [];

export const modelsStore = createStore<ModelsSnapshot>({
  multicaModels: [],
  openCodeModels: [],
  openCodeInstalled: false,
  remoteModels: [],
  availableModels: NO_MODELS,
  getModel: (id) => getMOrMulticaFallback(id),
  refreshOpenCodeModels: () => {},
  getProviderUpstreamConfig: () => null,
});

export function getModels(): ModelsSnapshot {
  return modelsStore.getState();
}

/** Resolve a conversation's model id against the current catalog. */
export function resolveModel(modelId: string | null | undefined): ModelDefinition {
  return modelsStore.getState().getModel(modelId);
}

export function useModelsField<K extends keyof ModelsSnapshot>(key: K): ModelsSnapshot[K] {
  return useStore(modelsStore, (s) => s[key]);
}
