import { useCallback, useEffect, useMemo } from "react";
import type { ClaudeModelDefinition, CodexModelDefinition } from "@shared/models";
import type {
  ProviderUpstreamConfig,
  ProviderUpstreamSettings,
  ProviderUpstreamsState,
  UpstreamProviderId,
} from "@shared/providers/types";
import { useStore } from "../store/createStore";
import {
  buildProviderUpstreamModels,
  clearProviderUpstreamConfig,
  getProviderUpstreamConfig,
  getProviderUpstreamsStore,
  normalizeUpstreamProvider,
  reloadProviderUpstreamsStore,
  saveProviderUpstreamConfig,
} from "../providerUpstreams/store";

function notifyProviderUpstreamsChanged(): void {
  window.dispatchEvent(new CustomEvent("provider-upstreams-refresh"));
}

// `api` is missing outside Electron and in the Project Manager window.
function getApi(): Window["api"] | undefined {
  if (typeof window === "undefined") return undefined;
  const api: Window["api"] | undefined = window.api;
  return api;
}

function saveConfig(provider: UpstreamProviderId, patch: Partial<ProviderUpstreamSettings>): ProviderUpstreamsState {
  const next = saveProviderUpstreamConfig(provider, patch);
  notifyProviderUpstreamsChanged();
  const api = getApi();
  const normalizedProvider = normalizeUpstreamProvider(provider);
  if (api?.syncProviderUpstreams && normalizedProvider) {
    const config = getProviderUpstreamConfig(normalizedProvider, next);
    if (config) {
      void api.syncProviderUpstreams(normalizedProvider, config);
    }
  }
  return next;
}

function clearConfig(provider: UpstreamProviderId): ProviderUpstreamsState {
  const next = clearProviderUpstreamConfig(provider);
  notifyProviderUpstreamsChanged();
  const api = getApi();
  const normalizedProvider = normalizeUpstreamProvider(provider);
  if (api?.syncProviderUpstreams && normalizedProvider) {
    void api.syncProviderUpstreams(normalizedProvider, null);
  }
  return next;
}

function refresh(): void {
  reloadProviderUpstreamsStore();
}

export interface UseProviderUpstreamsResult {
  configsByProvider: ProviderUpstreamsState["providers"];
  /** Models of every active upstream; they replace that provider's built-ins. */
  overrideModels: (ClaudeModelDefinition | CodexModelDefinition)[];
  getConfig: (provider: UpstreamProviderId) => ProviderUpstreamConfig | null;
  saveConfig: (provider: UpstreamProviderId, patch: Partial<ProviderUpstreamSettings>) => ProviderUpstreamsState;
  clearConfig: (provider: UpstreamProviderId) => ProviderUpstreamsState;
  refresh: () => void;
}

/** Provider-upstream settings, shared by every caller through one store. */
export function useProviderUpstreams(): UseProviderUpstreamsResult {
  const state = useStore(getProviderUpstreamsStore(), (s) => s);

  useEffect(() => {
    window.addEventListener("provider-upstreams-refresh", refresh);
    return () => window.removeEventListener("provider-upstreams-refresh", refresh);
  }, []);

  const getConfig = useCallback(
    (provider: UpstreamProviderId) => getProviderUpstreamConfig(provider, state),
    [state],
  );

  const overrideModels = useMemo(() => buildProviderUpstreamModels(state), [state]);

  return useMemo(
    () => ({ configsByProvider: state.providers, overrideModels, getConfig, saveConfig, clearConfig, refresh }),
    [state.providers, overrideModels, getConfig],
  );
}
