import { useEffect, useMemo } from "react";
import { multicaAgentToModel, type MulticaModelDefinition } from "@shared/models";
import type { MulticaStoreState } from "@shared/providers/types";
import { createStore, useStore, type Store } from "../store/createStore";
import { getMulticaStore, isMulticaConfigured, loadMulticaState, normalizeMulticaAgents, saveMulticaState } from "../multica/store";
import { createRefresher } from "./createRefresher";

export { multicaAgentToModel } from "@shared/models";

interface MulticaModelsState {
  state: MulticaStoreState;
  models: MulticaModelDefinition[];
  loading: boolean;
  error: unknown;
}

let modelsStore: Store<MulticaModelsState> | null = null;

/** Created on first use (it reads the saved agent cache) so importing stays side-effect free. */
function getModelsStore(): Store<MulticaModelsState> {
  if (!modelsStore) {
    const state = getMulticaStore().getState();
    modelsStore = createStore<MulticaModelsState>({
      state,
      models: state.agentsCache.map((agent) => multicaAgentToModel(agent, state)),
      loading: false,
      error: null,
    });
  }
  return modelsStore;
}

/** Mount-triggered refreshes within this window reuse the last agent list. */
const MOUNT_REFRESH_STALE_MS = 10_000;

const refresher = createRefresher(async () => {
  const store = getModelsStore();
  const s = loadMulticaState();
  store.setState((prev) => ({ ...prev, state: s }));
  if (!isMulticaConfigured(s)) {
    store.setState((prev) => ({ ...prev, models: [] }));
    return;
  }
  store.setState((prev) => ({ ...prev, loading: true, error: null }));
  try {
    const agents = normalizeMulticaAgents(
      await window.api.multicaListAgents({
        serverUrl: s.serverUrl,
        token: s.token,
        workspaceId: s.workspaceId,
        workspaceSlug: s.workspaceSlug,
      }),
    );
    saveMulticaState({ agentsCache: agents, agentsCachedAt: Date.now() });
    store.setState((prev) => ({ ...prev, models: agents.map((agent) => multicaAgentToModel(agent, s)) }));
  } catch (error) {
    store.setState((prev) => ({ ...prev, error }));
  } finally {
    store.setState((prev) => ({ ...prev, loading: false }));
  }
}, MOUNT_REFRESH_STALE_MS);

/** Re-read the Multica setup and re-fetch its agents (shared by every hook instance). */
export function refreshMulticaModels(): Promise<void> {
  return refresher.refresh();
}

/** Apply an `agent:status` push to the shared model list (no-op when unchanged). */
export function applyMulticaAgentStatus(detail: unknown): void {
  if (!detail || typeof detail !== "object") return;
  const { id, status } = detail as { id?: unknown; status?: unknown };
  if (typeof id !== "string" || !id) return;
  const nextStatus = typeof status === "string" ? status : undefined;
  getModelsStore().setState((prev) => {
    if (!prev.models.some((m) => m.agentId === id && m.status !== nextStatus)) return prev;
    return {
      ...prev,
      models: prev.models.map((m) => {
        if (m.agentId !== id) return m;
        const { status: _previous, ...rest } = m;
        return nextStatus === undefined ? rest : { ...rest, status: nextStatus };
      }),
    };
  });
}

export interface UseMulticaModelsResult {
  models: MulticaModelDefinition[];
  loading: boolean;
  error: unknown;
  refresh: () => Promise<void>;
  state: MulticaStoreState;
}

/**
 * Multica agents as picker models. State is shared across all callers: one
 * agent fetch serves every mounted instance.
 */
export function useMulticaModels(): UseMulticaModelsResult {
  const { state, models, loading, error } = useStore(getModelsStore(), (s) => s);

  useEffect(() => {
    void refresher.refreshIfStale();
  }, []);

  useEffect(() => {
    const handleRefresh = () => {
      void refresher.refresh();
    };
    window.addEventListener("multica-refresh", handleRefresh);
    return () => window.removeEventListener("multica-refresh", handleRefresh);
  }, []);

  useEffect(() => {
    const handleStatus = (event: Event) => {
      applyMulticaAgentStatus((event as CustomEvent<unknown>).detail);
    };
    window.addEventListener("multica-agent-status", handleStatus);
    return () => window.removeEventListener("multica-agent-status", handleStatus);
  }, []);

  return useMemo(
    () => ({ models, loading, error, refresh: refreshMulticaModels, state }),
    [models, loading, error, state],
  );
}
