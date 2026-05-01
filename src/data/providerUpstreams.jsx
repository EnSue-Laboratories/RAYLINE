import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildProviderUpstreamModels,
  clearProviderUpstreamConfig,
  getProviderUpstreamConfig,
  loadProviderUpstreamsState,
  saveProviderUpstreamConfig,
} from "../providerUpstreams/store";

export function useProviderUpstreams() {
  const [state, setState] = useState(() => loadProviderUpstreamsState());

  const refresh = useCallback(() => {
    setState(loadProviderUpstreamsState());
  }, []);

  useEffect(() => {
    const handleRefresh = () => refresh();
    window.addEventListener("provider-upstreams-refresh", handleRefresh);
    return () => window.removeEventListener("provider-upstreams-refresh", handleRefresh);
  }, [refresh]);

  const saveConfig = useCallback((provider, patch) => {
    const next = saveProviderUpstreamConfig(provider, patch);
    setState(next);
    window.dispatchEvent(new CustomEvent("provider-upstreams-refresh"));
    if (window.api?.syncProviderUpstreams) {
      const config = getProviderUpstreamConfig(provider, next);
      if (config) {
        window.api.syncProviderUpstreams(provider, config);
      }
    }
    return next;
  }, []);

  const clearConfig = useCallback((provider) => {
    const next = clearProviderUpstreamConfig(provider);
    setState(next);
    window.dispatchEvent(new CustomEvent("provider-upstreams-refresh"));
    if (window.api?.syncProviderUpstreams) {
      window.api.syncProviderUpstreams(provider, null);
    }
    return next;
  }, []);

  const getConfig = useCallback((provider) => (
    getProviderUpstreamConfig(provider, state)
  ), [state]);

  const overrideModels = useMemo(() => (
    buildProviderUpstreamModels(state)
  ), [state]);

  return {
    configsByProvider: state.providers || {},
    overrideModels,
    getConfig,
    saveConfig,
    clearConfig,
    refresh,
  };
}
