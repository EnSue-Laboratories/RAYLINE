import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { getAvailableModels, getMOrMulticaFallback } from "./models";
import { useRuntimeModels, refreshRuntimeModels } from "./runtimeModels";
import { useProviderUpstreams } from "./providerUpstreams.jsx";

export const EMPTY_MODEL_EXTRAS = [];
let installed = {};
let pending;
let checkedAt = 0;
const listeners = new Set();
const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
const snapshot = () => installed;

function refreshInstalled(force = false) {
  if (!window.api?.checkCliInstalled || pending || (!force && Date.now() - checkedAt < 60_000)) return pending;
  pending = window.api.checkCliInstalled({ force }).then(result => {
    if (result) { installed = result; checkedAt = Date.now(); listeners.forEach(listener => listener()); }
  }).catch(() => {}).finally(() => { pending = null; });
  return pending;
}
function refresh() {
  return Promise.allSettled([refreshRuntimeModels(), refreshInstalled(true)]);
}

// Conversation, new-chat and dispatch selectors share discovery, overrides,
// de-duplication and installation state. Layout is a concern of ModelPicker.
export function useModelCatalog(extraModels = EMPTY_MODEL_EXTRAS) {
  const runtimeModels = useRuntimeModels();
  const { overrideModels } = useProviderUpstreams();
  const installedModels = useSyncExternalStore(subscribe, snapshot);
  const merged = useMemo(() => [...runtimeModels, ...overrideModels, ...extraModels], [runtimeModels, overrideModels, extraModels]);
  const models = useMemo(() => getAvailableModels(merged), [merged]);
  const getModel = useCallback(id => getMOrMulticaFallback(id, merged), [merged]);
  useEffect(() => { void refreshInstalled(); }, []);
  return useMemo(() => ({ models, installed: installedModels, getModel, refresh }), [models, installedModels, getModel]);
}
