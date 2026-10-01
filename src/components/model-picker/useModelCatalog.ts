/**
 * One model catalog shared by every picker (conversation, new chat, dispatch):
 * runtime discovery (`model-catalog` IPC), provider-upstream overrides, extra
 * models and CLI install state. Discovery and install probes are
 * module-level stores, so N mounted pickers cost one IPC round-trip.
 * Ported from #230's src/data/useModelCatalog + runtimeModels.
 */

import { useCallback, useEffect, useMemo } from "react";
import {
  buildRuntimeModels,
  getAvailableModels,
  getMOrMulticaFallback,
  normalizeRuntimeModelCatalog,
  type InstalledProviders,
  type ModelDefinition,
} from "@shared/models";
import type { CliInstalledSnapshot } from "@shared/providers/types";
import { createRefresher } from "../../data/createRefresher";
import { useProviderUpstreams } from "../../data/providerUpstreams";
import { createStore, useStore } from "../../store/createStore";
import type { CliVersions } from "./catalogView";

interface CatalogState {
  /** `buildRuntimeModels(model-catalog)`; empty until discovery succeeds. */
  runtimeModels: readonly ModelDefinition[];
  /** Last `check-cli-installed` result; null = unknown (treated as installed). */
  installed: CliInstalledSnapshot | null;
}

const NO_MODELS: readonly ModelDefinition[] = [];
const NOTHING_INSTALLED_KNOWN: InstalledProviders = {};

const catalogStore = createStore<CatalogState>({ runtimeModels: NO_MODELS, installed: null });

/** Runtime discovery shells out to the CLIs; once a minute is plenty. */
const RUNTIME_STALE_MS = 60_000;
/** Matches main's own `check-cli-installed` cache. */
const INSTALLED_STALE_MS = 5_000;

const runtimeRefresher = createRefresher(async () => {
  if (!window.api?.getModelCatalog) return;
  try {
    const catalog = normalizeRuntimeModelCatalog(await window.api.getModelCatalog());
    catalogStore.setState((prev) => ({ ...prev, runtimeModels: buildRuntimeModels(catalog) }));
  } catch {
    // Keep the static catalog when discovery is unavailable.
  }
}, RUNTIME_STALE_MS);

let forceNextInstallProbe = false;
const installedRefresher = createRefresher(async () => {
  if (!window.api?.checkCliInstalled) return;
  const force = forceNextInstallProbe;
  forceNextInstallProbe = false;
  try {
    const installed = await window.api.checkCliInstalled({ force });
    catalogStore.setState((prev) => ({ ...prev, installed }));
  } catch {
    // Unknown install state shows every provider.
  }
}, INSTALLED_STALE_MS);

/** Re-discover models and re-probe installed CLIs (e.g. when a picker opens). */
export function refreshModelCatalog(): Promise<void> {
  forceNextInstallProbe = true;
  return Promise.allSettled([runtimeRefresher.refreshIfStale(), installedRefresher.refreshIfStale()]).then(() => undefined);
}

export interface ModelCatalog {
  /** Every selectable model before picker filtering (`visibleModels`). */
  models: readonly ModelDefinition[];
  installed: InstalledProviders;
  /** Per-CLI versions when main reports them. */
  versions: CliVersions | undefined;
  /** Resolve a (possibly legacy / unknown) id against this catalog. */
  getModel: (id: string | null | undefined) => ModelDefinition;
  refresh: () => Promise<void>;
}

const selectRuntimeModels = (state: CatalogState) => state.runtimeModels;
const selectInstalled = (state: CatalogState) => state.installed;

export function useModelCatalog(extraModels: readonly ModelDefinition[] = NO_MODELS): ModelCatalog {
  const runtimeModels = useStore(catalogStore, selectRuntimeModels);
  const installedSnapshot = useStore(catalogStore, selectInstalled);
  const { overrideModels } = useProviderUpstreams();

  useEffect(() => {
    void runtimeRefresher.refreshIfStale();
    void installedRefresher.refreshIfStale();
  }, []);

  const merged = useMemo(
    () => [...runtimeModels, ...overrideModels, ...extraModels],
    [runtimeModels, overrideModels, extraModels],
  );
  const models = useMemo(() => getAvailableModels(merged), [merged]);
  const getModel = useCallback((id: string | null | undefined) => getMOrMulticaFallback(id, merged), [merged]);

  return useMemo<ModelCatalog>(
    () => ({
      models,
      installed: installedSnapshot ?? NOTHING_INSTALLED_KNOWN,
      versions: installedSnapshot?.versions,
      getModel,
      refresh: refreshModelCatalog,
    }),
    [models, installedSnapshot, getModel],
  );
}
