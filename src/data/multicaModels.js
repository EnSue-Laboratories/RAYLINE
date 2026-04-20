import { useEffect, useState, useCallback } from "react";
import { loadMulticaState, saveMulticaState } from "../multica/store";
import ModelPicker from "../components/ModelPicker";

export function multicaAgentToModel(agent, state) {
  return {
    id: `multica:${agent.id}`,
    name: agent.name,
    tag: (agent.status || "unknown").toUpperCase(),
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
    if (!s.token || !s.serverUrl || !s.workspaceSlug) {
      setModels([]);
      return;
    }
    setLoading(true); setError(null);
    try {
      const agents = await window.api.multicaListAgents({
        serverUrl: s.serverUrl, token: s.token, workspaceSlug: s.workspaceSlug,
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

  return { models, loading, error, refresh, state };
}

export function ModelPickerWithMultica({ value, onChange }) {
  const { models, error } = useMulticaModels();
  return <ModelPicker value={value} onChange={onChange} extraModels={models} extraError={error} />;
}
