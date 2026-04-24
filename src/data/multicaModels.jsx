import { useEffect, useState, useCallback } from "react";
import { loadMulticaState, saveMulticaState } from "../multica/store";
import { getByokPresetsForEndpoints } from "./byok-models";
import ModelPicker from "../components/ModelPicker";

// eslint-disable-next-line react-refresh/only-export-components
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

// eslint-disable-next-line react-refresh/only-export-components
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
        .filter(p => p.id.startsWith("custom-") || p.type?.startsWith("opencode") || p.id.startsWith("opencode"))
        .map(p => {
          // If defaultModelId isn't set, default to a fallback.
          return {
            id: `byok:${p.id}:${p.defaultModelId || "default"}`,
            name: p.name || (p.type === "opencode-cli" ? "OpenCode CLI" : "OpenCode"),
            tag: (p.defaultModelId || "DEFAULT").toUpperCase(),
            provider: "byok",
            endpoint: p.id,
            modelId: p.defaultModelId || "default",
            contextWindow: 200_000,
          };
        });
      setModels([...presets, ...customModels]);
    } catch {
      setModels([]);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
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
