import { useEffect, useState, useCallback } from "react";
import { loadMulticaState, saveMulticaState } from "../multica/store";
import { getByokPresetsForEndpoints } from "./byok-models";
import ModelPicker from "../components/ModelPicker";

export function multicaAgentToModel(agent, state) {
  return {
    id: `multica:${agent.id}`,
    name: agent.name,
    tag: (agent.name || "agent").toUpperCase(),
    provider: "multica",
    agentId: agent.id,
    workspaceId: state.workspaceId,
    workspaceSlug: state.workspaceSlug,
    runtimeId: agent.runtime_id,
    status: agent.status,
  };
}

export function useMulticaModels() {
  const [state, setState] = useState(() => loadMulticaState());
  const [models, setModels] = useState(() => (state.agentsCache || []).map((a) => multicaAgentToModel(a, state)));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    const s = loadMulticaState();
    setState(s);
    if (!s.token || !s.serverUrl || (!s.workspaceId && !s.workspaceSlug)) {
      setModels([]);
      return;
    }
    setLoading(true); setError(null);
    try {
      const agents = await window.api.multicaListAgents({
        serverUrl: s.serverUrl,
        token: s.token,
        workspaceId: s.workspaceId,
        workspaceSlug: s.workspaceSlug,
      });
      saveMulticaState({ agentsCache: agents, agentsCachedAt: Date.now() });
      setModels(agents.map((a) => multicaAgentToModel(a, s)));
    } catch (e) {
      setError(e);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    const h = () => { void refresh(); };
    window.addEventListener("multica-refresh", h);
    return () => window.removeEventListener("multica-refresh", h);
  }, [refresh]);

  useEffect(() => {
    const h = (e) => {
      const agent = e.detail;
      if (!agent?.id) return;
      setModels((prev) => prev.map((m) => m.agentId === agent.id
        ? { ...m, status: agent.status }
        : m));
    };
    window.addEventListener("multica-agent-status", h);
    return () => window.removeEventListener("multica-agent-status", h);
  }, []);

  return { models, loading, error, refresh, state };
}

function useByokModels() {
  const [models, setModels] = useState([]);

  const refresh = useCallback(async () => {
    if (!window.api?.byokLoadProviders) { setModels([]); return; }
    try {
      const providers = await window.api.byokLoadProviders();
      const endpointIds = providers.map((p) => p.id);
      const presets = getByokPresetsForEndpoints(endpointIds);
      const customModels = providers
        .filter(p => p.id.startsWith("custom-"))
        .map(p => {
          // If defaultModelId isn't set, default to a fallback.
          // Need to dynamically import buildCustomByokModel from byok-models
          return {
            id: `byok:${p.id}:${p.defaultModelId || "custom-model"}`,
            name: p.name || "Custom Provider",
            tag: (p.defaultModelId || "CUSTOM").toUpperCase(),
            provider: "byok",
            endpoint: p.id,
            modelId: p.defaultModelId || "custom-model",
            contextWindow: 128_000,
          };
        });
      setModels([...presets, ...customModels]);
    } catch {
      setModels([]);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    const h = () => { void refresh(); };
    window.addEventListener("byok-refresh", h);
    return () => window.removeEventListener("byok-refresh", h);
  }, [refresh]);

  return models;
}

export function ModelPickerWithMultica({ value, onChange }) {
  const { models, error, loading } = useMulticaModels();
  const byokModels = useByokModels();
  return <ModelPicker value={value} onChange={onChange} extraModels={[...models, ...byokModels]} extraError={error} extraLoading={loading} />;
}
