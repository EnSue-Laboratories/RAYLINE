import { useEffect, useSyncExternalStore } from "react";
import { buildRuntimeModels } from "./models";

let models = [];
let pending;
let checkedAt = 0;
const listeners = new Set();
const subscribe = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };
const getSnapshot = () => models;

export async function refreshRuntimeModels() {
  if (!window.api?.getModelCatalog || pending || Date.now() - checkedAt < 60_000) return pending;
  pending = window.api.getModelCatalog().then((catalog) => {
    models = buildRuntimeModels(catalog);
    checkedAt = Date.now();
    listeners.forEach((listener) => listener());
  }).catch(() => { /* Retain the built-in catalog when discovery is unavailable. */ }).finally(() => { pending = null; });
  return pending;
}

export function useRuntimeModels() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);
  useEffect(() => { void refreshRuntimeModels(); }, []);
  return snapshot;
}
