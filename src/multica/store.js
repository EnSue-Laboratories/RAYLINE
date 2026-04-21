// Persist Multica setup across restarts. One server URL per install for v1
// (there's no UI to support multiple). Key is versioned so we can migrate later.

const KEY = "multica.v1";
const LEGACY_PRIVATE_SERVER_URL = "https://srv1309901.tail96f1f.ts.net";

const defaultState = () => ({
  serverUrl: "",       // e.g. https://your-multica-server
  email: "",
  token: "",           // JWT, 30-day TTL
  tokenIssuedAt: 0,
  workspaceId: "",
  workspaceSlug: "",
  agentsCache: [],     // last-known agents for instant model-picker render
  agentsCachedAt: 0,
});

export function normalizeMulticaServerUrl(value) {
  return typeof value === "string" ? value.trim().replace(/\/+$/, "") : "";
}

function sanitizeMulticaState(raw) {
  const next = { ...defaultState(), ...(raw && typeof raw === "object" ? raw : {}) };
  next.serverUrl = normalizeMulticaServerUrl(next.serverUrl);

  const onlyLegacyDefault =
    next.serverUrl === LEGACY_PRIVATE_SERVER_URL &&
    !next.email &&
    !next.token &&
    !next.workspaceId &&
    !next.workspaceSlug;
  if (onlyLegacyDefault) {
    next.serverUrl = "";
  }

  if (!next.serverUrl) {
    next.token = "";
    next.tokenIssuedAt = 0;
    next.workspaceId = "";
    next.workspaceSlug = "";
    next.agentsCache = [];
    next.agentsCachedAt = 0;
  }

  return next;
}

export function loadMulticaState() {
  try { return sanitizeMulticaState(JSON.parse(localStorage.getItem(KEY) || "{}")); }
  catch { return defaultState(); }
}

export function saveMulticaState(patch) {
  const next = sanitizeMulticaState({ ...loadMulticaState(), ...patch });
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function clearMulticaState() {
  localStorage.removeItem(KEY);
}

export function isMulticaAuthenticated() {
  const { token, serverUrl, workspaceId, workspaceSlug } = loadMulticaState();
  return Boolean(token && serverUrl && (workspaceId || workspaceSlug));
}
