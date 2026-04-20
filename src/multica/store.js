// Persist Multica setup across restarts. One server URL per install for v1
// (there's no UI to support multiple). Key is versioned so we can migrate later.

const KEY = "multica.v1";

const defaultState = () => ({
  serverUrl: "",       // e.g. https://srv1309901.tail96f1f.ts.net
  email: "",
  token: "",           // JWT, 30-day TTL
  tokenIssuedAt: 0,
  workspaceId: "",
  workspaceSlug: "",
  agentsCache: [],     // last-known agents for instant model-picker render
  agentsCachedAt: 0,
});

export function loadMulticaState() {
  try { return { ...defaultState(), ...(JSON.parse(localStorage.getItem(KEY) || "{}")) }; }
  catch { return defaultState(); }
}

export function saveMulticaState(patch) {
  const next = { ...loadMulticaState(), ...patch };
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function clearMulticaState() {
  localStorage.removeItem(KEY);
}

export function isMulticaAuthenticated() {
  const { token, serverUrl, workspaceSlug } = loadMulticaState();
  return Boolean(token && serverUrl && workspaceSlug);
}
