import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getActiveProviderUpstreamConfig,
  loadProviderUpstreamsState,
  removeProviderUpstreamProfile,
  setActiveProviderUpstream,
  upsertProviderUpstreamProfile,
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

  const saveProfile = useCallback((entry) => {
    const next = upsertProviderUpstreamProfile(entry);
    setState(next);
    window.dispatchEvent(new CustomEvent("provider-upstreams-refresh"));
    return next;
  }, []);

  const removeProfile = useCallback((profileId) => {
    const next = removeProviderUpstreamProfile(profileId);
    setState(next);
    window.dispatchEvent(new CustomEvent("provider-upstreams-refresh"));
    return next;
  }, []);

  const setActiveProfile = useCallback((provider, profileId) => {
    const next = setActiveProviderUpstream(provider, profileId);
    setState(next);
    window.dispatchEvent(new CustomEvent("provider-upstreams-refresh"));
    return next;
  }, []);

  const getActiveConfig = useCallback((provider) => (
    getActiveProviderUpstreamConfig(provider, state)
  ), [state]);

  const profilesByProvider = useMemo(() => {
    const grouped = { claude: [], codex: [] };
    for (const profile of state.profiles || []) {
      if (grouped[profile.provider]) grouped[profile.provider].push(profile);
    }
    return grouped;
  }, [state.profiles]);

  return {
    profiles: state.profiles || [],
    profilesByProvider,
    activeByProvider: state.activeByProvider || {},
    getActiveConfig,
    saveProfile,
    removeProfile,
    setActiveProfile,
    refresh,
  };
}
