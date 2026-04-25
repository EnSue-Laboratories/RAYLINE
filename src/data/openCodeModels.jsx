import { useCallback, useEffect, useMemo, useState } from "react";
import {
  loadOpenCodeState,
  openCodeEntryToModel,
  removeOpenCodeModel,
  saveOpenCodeState,
  upsertOpenCodeModel,
} from "../opencode/store";

const EMPTY_STATUS = {
  installed: false,
  configured: false,
  version: "",
  configPath: "",
  authPath: "",
  providers: [],
};

function normalizeStatus(status) {
  if (!status || typeof status !== "object") return EMPTY_STATUS;
  return {
    ...EMPTY_STATUS,
    ...status,
    installed: Boolean(status.installed),
    configured: Boolean(status.configured),
    providers: Array.isArray(status.providers) ? status.providers.filter(Boolean) : [],
  };
}

export function useOpenCodeModels() {
  const [state, setState] = useState(() => loadOpenCodeState());
  const [status, setStatus] = useState(EMPTY_STATUS);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setState(loadOpenCodeState());
    if (!window.api?.opencodeStatus) return;
    setLoading(true);
    try {
      const nextStatus = await window.api.opencodeStatus();
      setStatus(normalizeStatus(nextStatus));
    } catch {
      setStatus(EMPTY_STATUS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const handleRefresh = () => {
      void refresh();
    };
    window.addEventListener("opencode-refresh", handleRefresh);
    return () => window.removeEventListener("opencode-refresh", handleRefresh);
  }, [refresh]);

  const models = useMemo(() => {
    if (!status.installed || !status.configured) return [];
    return (state.models || []).map(openCodeEntryToModel).filter(Boolean);
  }, [state.models, status.configured, status.installed]);

  const saveModel = useCallback((entry) => {
    const next = upsertOpenCodeModel(entry);
    setState(next);
    window.dispatchEvent(new CustomEvent("opencode-refresh"));
    return next;
  }, []);

  const removeModel = useCallback((modelKey) => {
    const next = removeOpenCodeModel(modelKey);
    setState(next);
    window.dispatchEvent(new CustomEvent("opencode-refresh"));
    return next;
  }, []);

  const replaceState = useCallback((patch) => {
    const next = saveOpenCodeState(patch);
    setState(next);
    window.dispatchEvent(new CustomEvent("opencode-refresh"));
    return next;
  }, []);

  return {
    models,
    rawModels: state.models || [],
    status,
    loading,
    refresh,
    saveModel,
    removeModel,
    replaceState,
  };
}
