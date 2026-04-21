# Multica Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let a RayLine user chat with a remote Multica agent the same way they chat with Claude or Codex — one tab, one worktree, one transcript — while Multica runtimes push code to a dedicated branch that RayLine surfaces through its existing git UI.

**Architecture:** Multica is a third provider alongside Claude and Codex. All Multica network I/O lives in the Electron main process (new `electron/multica-manager.cjs`) and delivers events via the existing `onAgentStream` IPC channel, so the renderer's `useAgent` hook handles all three providers identically after a thin normalization layer. A new Multica section in `ModelPicker` lists agents fetched from `GET /api/agents`; picking one at new-chat time publishes the branch (`git push`) before `POST /api/chat/sessions/{sid}/messages` so the remote runtime can fetch the branch.

**Tech Stack:** JavaScript (React), Electron (CommonJS main + ESM renderer), native `WebSocket` in main, existing `window.api` IPC, Multica server REST + WS (`srv1309901.tail96f1f.ts.net` for dev). Protocol spec: `server/pkg/protocol/{events,messages}.go` in the multica-ai/multica repo.

**Reference design:** `docs/plans/2026-04-20-multica-integration-design.md`.

---

## Pre-flight

Before starting Phase 0, read:

- `docs/plans/2026-04-20-multica-integration-design.md` — full design context
- `src/data/models.js` — model registry
- `src/components/ModelPicker.jsx` — provider-group rendering
- `src/components/NewChatCard.jsx:239-254` — `onCreateChat` payload shape
- `src/App.jsx:2180-2256` — `handleCreateChat` (git ops live here)
- `src/hooks/useAgent.js:235-720` — stream event normalization
- `electron/main.cjs:292-311` — IPC `agent-start` / `agent-cancel` / `agent-edit-resend`
- `electron/preload.cjs` — how IPC is exposed to the renderer
- `electron/agent-manager.cjs` and `electron/codex-agent-manager.cjs` — reference patterns for a new manager

**Captured real stream for reference** (save to `docs/plans/fixtures/multica-stream-example.json` in Task 0.1 below).

---

## Phase 0 — Scaffolding and captured fixture

### Task 0.1: Save captured stream fixture for tests

**Files:**
- Create: `docs/plans/fixtures/multica-stream-example.json`

**Step 1: Save the stream we captured during brainstorming**

Write the following JSON to the fixture file (these are the exact frames from the dev server):

```json
[
  { "type": "chat:message", "payload": { "chat_session_id": "ff210145-a15f-4aa5-92c9-a0621327262e", "message_id": "4fd94ce5-d593-4cae-8487-66f2abc4cf1a", "role": "user", "content": "Reply in one short sentence. No tools.", "task_id": "3813c2ee-825a-4138-9ed4-a57b9d619d31", "created_at": "2026-04-20T19:00:42Z" } },
  { "type": "agent:status", "payload": { "agent": { "id": "a2ecb1a6-d216-4e71-9c16-bba408190418", "name": "Claude", "status": "working", "workspace_id": "4f1e09a3-9252-4b49-b455-73163ff633df" } } },
  { "type": "task:dispatch", "payload": { "task_id": "3813c2ee-825a-4138-9ed4-a57b9d619d31" } },
  { "type": "task:message", "payload": { "task_id": "3813c2ee-825a-4138-9ed4-a57b9d619d31", "seq": 1, "type": "text", "content": "Got it, ready when you are." } },
  { "type": "chat:done", "payload": { "chat_session_id": "ff210145-a15f-4aa5-92c9-a0621327262e", "task_id": "3813c2ee-825a-4138-9ed4-a57b9d619d31", "content": "" } },
  { "type": "agent:status", "payload": { "agent": { "id": "a2ecb1a6-d216-4e71-9c16-bba408190418", "name": "Claude", "status": "idle", "workspace_id": "4f1e09a3-9252-4b49-b455-73163ff633df" } } },
  { "type": "task:completed", "payload": { "agent_id": "a2ecb1a6-d216-4e71-9c16-bba408190418", "chat_session_id": "ff210145-a15f-4aa5-92c9-a0621327262e", "issue_id": "", "status": "completed", "task_id": "3813c2ee-825a-4138-9ed4-a57b9d619d31" } }
]
```

**Step 2: Commit**

```bash
git add docs/plans/fixtures/multica-stream-example.json
git commit -m "test: add Multica stream fixture captured from dev server"
```

---

### Task 0.2: Create empty `multica-manager.cjs` skeleton

**Files:**
- Create: `electron/multica-manager.cjs`

**Step 1: Write skeleton**

```javascript
"use strict";
// Multica remote-agent manager.
//
// Owns: one WebSocket per (server, workspace) — shared across all conversations
// bound to that workspace — plus REST helpers for auth, workspace discovery,
// agent list, chat-session create, message send.
//
// Delivers events through `window.api.onAgentStream` so useAgent.js can handle
// them identically to Claude/Codex after a thin mapping step.

module.exports = {
  startMulticaAgent,
  cancelMulticaAgent,
  // Setup-flow helpers (called directly via ipcMain.handle, not via agent-start)
  multicaSendCode,
  multicaVerifyCode,
  multicaListWorkspaces,
  multicaListAgents,
  multicaEnsureSession, // used by handleCreateChat to create a session + push branch
};

// eslint-disable-next-line no-unused-vars
async function startMulticaAgent(opts, sender) { throw new Error("not implemented"); }
// eslint-disable-next-line no-unused-vars
function cancelMulticaAgent(conversationId) { throw new Error("not implemented"); }
// eslint-disable-next-line no-unused-vars
async function multicaSendCode({ serverUrl, email }) { throw new Error("not implemented"); }
// eslint-disable-next-line no-unused-vars
async function multicaVerifyCode({ serverUrl, email, code }) { throw new Error("not implemented"); }
// eslint-disable-next-line no-unused-vars
async function multicaListWorkspaces({ serverUrl, token }) { throw new Error("not implemented"); }
// eslint-disable-next-line no-unused-vars
async function multicaListAgents({ serverUrl, token, workspaceSlug }) { throw new Error("not implemented"); }
// eslint-disable-next-line no-unused-vars
async function multicaEnsureSession({ serverUrl, token, workspaceSlug, agentId, title }) { throw new Error("not implemented"); }
```

**Step 2: Commit**

```bash
git add electron/multica-manager.cjs
git commit -m "chore: scaffold Multica manager"
```

---

## Phase 1 — REST client + auth + workspace discovery

### Task 1.1: Implement REST helpers

**Files:**
- Modify: `electron/multica-manager.cjs`

**Step 1: Add a tiny REST helper at module top**

Replace the module-level placeholders with a real `rest()` helper and wire each `multica*` function to it. Use Electron's bundled `node:https` (already available in main). No extra deps.

```javascript
const { URL } = require("node:url");
const https = require("node:https");
const http = require("node:http");

function rest({ serverUrl, method = "GET", path, token, workspaceSlug, body }) {
  return new Promise((resolve, reject) => {
    const u = new URL(path, serverUrl);
    const mod = u.protocol === "http:" ? http : https;
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (workspaceSlug) headers["X-Workspace-Slug"] = workspaceSlug;
    const payload = body ? Buffer.from(JSON.stringify(body)) : null;
    if (payload) headers["Content-Length"] = payload.length;
    const req = mod.request({ method, hostname: u.hostname, port: u.port, path: u.pathname + u.search, headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        const isJson = (res.headers["content-type"] || "").startsWith("application/json");
        const data = text ? (isJson ? JSON.parse(text) : text) : null;
        if (res.statusCode >= 400) {
          const err = new Error(`multica ${method} ${path} ${res.statusCode}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
          err.status = res.statusCode;
          err.body = data;
          return reject(err);
        }
        resolve(data);
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}
```

Then implement the helpers:

```javascript
async function multicaSendCode({ serverUrl, email }) {
  return rest({ serverUrl, method: "POST", path: "/auth/send-code", body: { email } });
}

async function multicaVerifyCode({ serverUrl, email, code }) {
  const res = await rest({ serverUrl, method: "POST", path: "/auth/verify-code", body: { email, code } });
  if (!res?.token) throw new Error("multica verify-code: no token in response");
  return res; // { token, user: { id, email, ... } }
}

async function multicaListWorkspaces({ serverUrl, token }) {
  return rest({ serverUrl, method: "GET", path: "/api/workspaces", token });
}

async function multicaListAgents({ serverUrl, token, workspaceSlug }) {
  return rest({ serverUrl, method: "GET", path: "/api/agents", token, workspaceSlug });
}

async function multicaEnsureSession({ serverUrl, token, workspaceSlug, agentId, title }) {
  return rest({
    serverUrl, method: "POST", path: "/api/chat/sessions",
    token, workspaceSlug,
    body: { agent_id: agentId, title: title || "RayLine chat" },
  });
}

async function multicaSendMessage({ serverUrl, token, workspaceSlug, sessionId, content }) {
  return rest({
    serverUrl, method: "POST", path: `/api/chat/sessions/${sessionId}/messages`,
    token, workspaceSlug, body: { content },
  });
}

// Expose sendMessage for startMulticaAgent (added later)
module.exports.multicaSendMessage = multicaSendMessage;
```

**Step 2: Commit**

```bash
git add electron/multica-manager.cjs
git commit -m "feat(multica): REST helpers for auth, workspaces, agents, sessions"
```

---

### Task 1.2: Wire IPC for setup-flow helpers

**Files:**
- Modify: `electron/main.cjs` (imports + near the existing IPC block ~line 290)
- Modify: `electron/preload.cjs`

**Step 1: In `main.cjs`, require the new module and expose IPC**

Near the top of `main.cjs`, alongside other requires (search for `require("./agent-manager")`), add:

```javascript
const {
  multicaSendCode,
  multicaVerifyCode,
  multicaListWorkspaces,
  multicaListAgents,
} = require("./multica-manager");
```

Near the existing `ipcMain.on("agent-start", ...)` block (around line 292), add:

```javascript
ipcMain.handle("multica-send-code", (_e, args) => multicaSendCode(args));
ipcMain.handle("multica-verify-code", (_e, args) => multicaVerifyCode(args));
ipcMain.handle("multica-list-workspaces", (_e, args) => multicaListWorkspaces(args));
ipcMain.handle("multica-list-agents", (_e, args) => multicaListAgents(args));
```

**Step 2: In `preload.cjs`, expose to renderer**

Add to the object given to `contextBridge.exposeInMainWorld("api", { ... })`:

```javascript
multicaSendCode: (args) => ipcRenderer.invoke("multica-send-code", args),
multicaVerifyCode: (args) => ipcRenderer.invoke("multica-verify-code", args),
multicaListWorkspaces: (args) => ipcRenderer.invoke("multica-list-workspaces", args),
multicaListAgents: (args) => ipcRenderer.invoke("multica-list-agents", args),
```

**Step 3: Smoke test from DevTools**

Launch the app (`pnpm dev` or equivalent), open devtools, run in the renderer console:

```javascript
await window.api.multicaSendCode({ serverUrl: "https://srv1309901.tail96f1f.ts.net", email: "dev@localhost" });
// { message: ... } — if you hit the rate limit just wait 60s and retry
const r = await window.api.multicaVerifyCode({ serverUrl: "https://srv1309901.tail96f1f.ts.net", email: "dev@localhost", code: "888888" });
const ws = await window.api.multicaListWorkspaces({ serverUrl: "https://srv1309901.tail96f1f.ts.net", token: r.token });
const agents = await window.api.multicaListAgents({ serverUrl: "https://srv1309901.tail96f1f.ts.net", token: r.token, workspaceSlug: ws[0].slug });
console.log(agents.map(a => [a.id, a.name, a.status]));
```

Expected: list of agents with `status` values like `idle` / `working` / `offline`.

**Step 4: Commit**

```bash
git add electron/main.cjs electron/preload.cjs
git commit -m "feat(multica): IPC bridge for setup and agent listing"
```

---

### Task 1.3: Persistent settings store

**Files:**
- Create: `src/multica/store.js`

**Step 1: Write a small `localStorage`-backed store**

```javascript
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
```

**Step 2: Commit**

```bash
git add src/multica/store.js
git commit -m "feat(multica): renderer-side settings store"
```

---

### Task 1.4: Setup modal

**Files:**
- Create: `src/components/MulticaSetupModal.jsx`

**Step 1: Minimal three-step modal**

- Step A: form for `serverUrl` (default `https://srv1309901.tail96f1f.ts.net`) + `email` → `multicaSendCode`.
- Step B: code input → `multicaVerifyCode` → save `token, email, serverUrl`.
- Step C: auto-fetch workspaces. 0 → prompt for name and show "Create workspace (defer to web UI)" with a link; 1 → save and close; N → picker, save chosen one.

Keep it visually consistent with other modals in `src/components/` (e.g. check an existing modal for styling conventions). No new design language needed. Use `loadMulticaState` / `saveMulticaState` to persist.

Keep error messages verbatim from the server (especially rate-limit / invalid-code messages).

**Step 2: Commit**

```bash
git add src/components/MulticaSetupModal.jsx
git commit -m "feat(multica): setup modal for server + workspace onboarding"
```

---

## Phase 2 — ModelPicker integration

### Task 2.1: Expand model registry with a dynamic layer

**Files:**
- Create: `src/data/multicaModels.js`
- Modify: `src/data/models.js`

**Step 1: Keep `MODELS` static (Claude + Codex) and add a hook**

In `src/data/multicaModels.js`:

```javascript
import { useEffect, useState, useCallback } from "react";
import { loadMulticaState, saveMulticaState } from "../multica/store";

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

  return { models, loading, error, refresh, state };
}
```

**Step 2: Extend `getM` in `src/data/models.js` to understand Multica ids**

`getM` currently falls back to `MODELS[0]` when an id isn't recognized. Multica ids look like `multica:<uuid>` and aren't in the static list — callers that just want the *kind* of model should get a shape-compatible object. Add:

```javascript
export function isMulticaModelId(id) {
  return typeof id === "string" && id.startsWith("multica:");
}

export function getMOrMulticaFallback(id, multicaModels) {
  if (isMulticaModelId(id)) {
    const hit = multicaModels?.find((m) => m.id === id);
    if (hit) return hit;
    return { id, name: "Multica agent", tag: "MULTICA", provider: "multica" };
  }
  return getM(id);
}
```

Don't modify `getM` itself — keep backward compat.

**Step 3: Commit**

```bash
git add src/data/models.js src/data/multicaModels.js
git commit -m "feat(multica): dynamic model entries from /api/agents"
```

---

### Task 2.2: Render Multica section in `ModelPicker`

**Files:**
- Modify: `src/components/ModelPicker.jsx`

**Step 1: Inject dynamic list**

Accept an optional `extraModels` prop (array), default `[]`. In the render loop on line 109, change the groups array:

```javascript
const groups = ["claude", "codex", "multica"];
const all = [...MODELS, ...extraModels];
// ...and swap `MODELS.filter(...)` → `all.filter((mm) => mm.provider === provider)`
// Swap `getM(value)` → `getMOrMulticaFallback(value, extraModels)`
```

When the `multica` section is empty (no connected workspace yet), render a single row that reads **"Connect Multica…"** and when clicked, dispatches a custom event `window.dispatchEvent(new CustomEvent("open-multica-setup"))`. The app listens for this to open the modal from Phase 1.4.

When it's empty because of an auth/list error, render a disabled row showing the error message truncated to one line.

**Step 2: Host-side hookup**

In each place that renders `<ModelPicker value={model} onChange={setModel} />`, wrap it so `extraModels` comes from `useMulticaModels()`. The simplest path: export a `ModelPickerWithMultica` wrapper from `src/data/multicaModels.js` and swap call sites.

Use `Grep` to find all usages of `<ModelPicker` and update each to the wrapper.

**Step 3: Verify visually**

Open app, open the model picker. With no Multica setup: you should see `MULTICA → Connect Multica…`. After completing setup: you should see the agents with their status tags (`IDLE` / `WORKING` / `OFFLINE`).

**Step 4: Commit**

```bash
git add src/components/ModelPicker.jsx src/data/multicaModels.js
git commit -m "feat(multica): model picker section + connect-entry"
```

---

### Task 2.3: Listen for the `open-multica-setup` event and render the modal

**Files:**
- Modify: `src/App.jsx`

**Step 1: Add state and listener**

Somewhere near other modal flags (search for existing modal state like `showNewChatCard`), add:

```javascript
const [showMulticaSetup, setShowMulticaSetup] = useState(false);

useEffect(() => {
  const h = () => setShowMulticaSetup(true);
  window.addEventListener("open-multica-setup", h);
  return () => window.removeEventListener("open-multica-setup", h);
}, []);
```

Render `<MulticaSetupModal open={showMulticaSetup} onClose={() => setShowMulticaSetup(false)} />` alongside existing modals.

On modal close with success, the renderer should re-run `useMulticaModels().refresh()` so the new agents appear in the picker. Achieve this by exposing `refresh` upward (call `window.dispatchEvent(new CustomEvent("multica-refresh"))` from the modal on success, and have `useMulticaModels` listen for it).

**Step 2: Commit**

```bash
git add src/App.jsx src/data/multicaModels.js
git commit -m "feat(multica): open setup modal from picker, refresh on success"
```

---

## Phase 3 — New-chat flow wiring

### Task 3.1: Publish the branch and create a Multica session on create

**Files:**
- Modify: `src/App.jsx:2186-2256` (`handleCreateChat`)
- Modify: `electron/preload.cjs` (add one new IPC passthrough)
- Modify: `electron/main.cjs` (add IPC handler)
- Modify: `electron/multica-manager.cjs` (implement `multicaEnsureSession`)

**Step 1: Expose `multicaEnsureSession` and `multicaSendMessage` over IPC**

In `main.cjs`:

```javascript
ipcMain.handle("multica-ensure-session", (_e, args) => multicaEnsureSession(args));
ipcMain.handle("multica-send-message", (_e, args) => multicaSendMessage(args));
```

In `preload.cjs`:

```javascript
multicaEnsureSession: (args) => ipcRenderer.invoke("multica-ensure-session", args),
multicaSendMessage: (args) => ipcRenderer.invoke("multica-send-message", args),
```

**Step 2: In `App.jsx`, branch `handleCreateChat` for Multica**

Just after the existing git-ops block at line 2206-2219, add (still inside `handleCreateChat`):

```javascript
const isMulticaModel = isMulticaModelId(modelId);
let multicaSession = null;
if (isMulticaModel) {
  const { loadMulticaState } = await import("./multica/store");
  const mState = loadMulticaState();
  // Publish the branch so Multica's runtime can fetch.
  if (n.cwd && opts.branch) {
    try {
      await window.api.gitPush(n.cwd);
    } catch (err) {
      throw new Error(`Failed to publish branch '${opts.branch}': ${err?.message || err}`);
    }
  }
  // Resolve agent id from "multica:<uuid>" model id
  const agentId = modelId.split(":")[1];
  multicaSession = await window.api.multicaEnsureSession({
    serverUrl: mState.serverUrl, token: mState.token,
    workspaceSlug: mState.workspaceSlug,
    agentId, title: opts.title || opts.prompt?.slice(0, 60) || "RayLine chat",
  });
  // Persist on the conversation so resume works after restart
  n._multica = {
    serverUrl: mState.serverUrl,
    workspaceSlug: mState.workspaceSlug,
    workspaceId: mState.workspaceId,
    agentId,
    sessionId: multicaSession.id,
  };
}
```

**Step 3: Prefix the first prompt with branch directive**

In the existing prompt assembly (line 2243-2246), after `issueContext` handling:

```javascript
if (isMulticaModel && opts.branch) {
  prompt = `Work on branch \`${opts.branch}\` — commit and push there. Your changes will be pulled down by the user locally.\n\n${prompt}`;
}
```

**Step 4: Implement `multicaEnsureSession` properly in the manager**

Already written in Task 1.1 — verify it returns `{ id, workspace_id, agent_id, ... }`.

**Step 5: Verify manually**

With a setup-connected Multica workspace: new chat → pick a Multica agent → type a prompt → check:
- `git branch -a` in the new worktree shows the branch pushed (`origin/<branch>` exists)
- The `_multica.sessionId` is on the conversation object (inspect via React devtools)

Don't worry about streaming yet — that's Phase 4.

**Step 6: Commit**

```bash
git add src/App.jsx electron/preload.cjs electron/main.cjs electron/multica-manager.cjs
git commit -m "feat(multica): publish branch and create chat session on new-chat"
```

---

## Phase 4 — Streaming and event normalization

### Task 4.1: Implement the Multica WebSocket connection in the manager

**Files:**
- Modify: `electron/multica-manager.cjs`

**Step 1: Use a WS library**

Electron's main has no built-in WS client. Use `ws` (already a transitive dep in most Electron projects — verify with `pnpm list ws`; if missing, `pnpm add ws`).

```javascript
const WebSocket = require("ws");
```

**Step 2: One WS per `(serverUrl, workspaceId)`**

Add a pool:

```javascript
// Map<string, { ws, ready: Promise<void>, subscriptions: Map<conversationId, {sessionId, sender}> }>
const wsPool = new Map();

function wsKey({ serverUrl, workspaceId }) {
  return `${serverUrl}#${workspaceId}`;
}

async function getOrOpenWS({ serverUrl, workspaceId, token }) {
  const key = wsKey({ serverUrl, workspaceId });
  const existing = wsPool.get(key);
  if (existing && existing.ws.readyState === WebSocket.OPEN) return existing;

  const wsURL = serverUrl.replace(/^http/, "ws") + `/ws?workspace_id=${workspaceId}`;
  const ws = new WebSocket(wsURL);
  const entry = { ws, subscriptions: new Map() };
  const ready = new Promise((resolve, reject) => {
    ws.once("open", () => {
      ws.send(JSON.stringify({ type: "auth", payload: { token } }));
    });
    ws.on("message", (raw) => {
      let msg; try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (msg.type === "auth_ack") return resolve();
      if (msg.error) return reject(new Error(msg.error));
      dispatchWSMessage(key, msg);
    });
    ws.once("error", reject);
    ws.once("close", () => {
      wsPool.delete(key);
      // TODO: reconnect with backoff (Phase 5)
    });
  });
  entry.ready = ready;
  wsPool.set(key, entry);
  await ready;
  return entry;
}
```

**Step 3: Route messages to subscribed conversations**

```javascript
function dispatchWSMessage(key, msg) {
  const entry = wsPool.get(key);
  if (!entry) return;
  const { type, payload } = msg;
  // Events are workspace-scoped; fan out to all subs that match session_id
  for (const [conversationId, sub] of entry.subscriptions.entries()) {
    const sid = payload?.chat_session_id || payload?.session_id;
    // Some events (agent:status, task:completed w/o chat_session_id) are
    // relevant to all subs of this workspace; forward those too.
    const isBroadcast = type === "agent:status"
      || (type === "task:completed" && payload?.chat_session_id && payload.chat_session_id === sub.sessionId)
      || sid === sub.sessionId;
    if (!isBroadcast) continue;
    try {
      sub.sender.send("agent-stream", { conversationId, event: { type: `multica:${type}`, payload } });
    } catch { /* sender destroyed */ }
  }
}
```

**Step 4: Implement `startMulticaAgent` (called by `agent-start` IPC)**

```javascript
async function startMulticaAgent(opts, sender) {
  const { conversationId, prompt, _multica } = opts;
  if (!_multica) throw new Error("startMulticaAgent: missing _multica context");
  const { serverUrl, workspaceId, workspaceSlug, sessionId } = _multica;
  const token = opts._multicaToken; // passed by useAgent from store
  if (!token) throw new Error("startMulticaAgent: missing token");

  const entry = await getOrOpenWS({ serverUrl, workspaceId, token });
  entry.subscriptions.set(conversationId, { sessionId, sender });

  // Fire the message via REST — the actual content comes back over WS
  await multicaSendMessage({ serverUrl, token, workspaceSlug, sessionId, content: prompt });
}

function cancelMulticaAgent(conversationId) {
  for (const entry of wsPool.values()) {
    entry.subscriptions.delete(conversationId);
  }
  // TODO (Phase 5): POST /api/tasks/{taskId}/cancel if we tracked the task id
}
```

**Step 5: Commit**

```bash
git add electron/multica-manager.cjs
git commit -m "feat(multica): WS pool + per-conversation subscription fan-out"
```

---

### Task 4.2: Wire `agent-start` to the Multica manager

**Files:**
- Modify: `electron/main.cjs:292-311`

**Step 1: Add Multica branch**

Change the `ipcMain.on("agent-start")` handler:

```javascript
ipcMain.on("agent-start", (event, opts) => {
  if (opts.provider === "multica") {
    startMulticaAgent(opts, event.sender).catch((err) => {
      event.sender.send("agent-stream", {
        conversationId: opts.conversationId,
        event: { type: "multica:error", payload: { message: err?.message || String(err) } },
      });
      event.sender.send("agent-done", { conversationId: opts.conversationId });
    });
  } else if (opts.provider === "codex") {
    startCodexAgent(opts, event.sender);
  } else {
    startAgent(opts, event.sender);
  }
});

ipcMain.on("agent-cancel", (_event, { conversationId }) => {
  cancelAgent(conversationId);
  cancelCodexAgent(conversationId);
  cancelMulticaAgent(conversationId);
});
```

Import `startMulticaAgent` and `cancelMulticaAgent` at the top alongside the other imports.

**Step 2: Commit**

```bash
git add electron/main.cjs
git commit -m "feat(multica): route agent-start to Multica manager"
```

---

### Task 4.3: Normalize Multica events in `useAgent.js`

**Files:**
- Modify: `src/hooks/useAgent.js` around the `onAgentStream` handler (line 235)
- Modify: `src/hooks/useAgent.js` around `startPreparedMessage` (line 816) to include `_multica` context + token

**Step 1: Pass Multica context to main**

In `startPreparedMessage`, when `provider === "multica"`, load the token from the store and attach the `_multica` context from the conversation. Fetch the conversation object so you can read `_multica`. (Add an argument or use a ref — simplest: accept `multicaContext` in `prepareMessage` / `startPreparedMessage` callers; update `sendMessageToConversation` in App.jsx to pass it.)

Ensure `window.api.agentStart` sees `{ conversationId, prompt, provider: "multica", _multica, _multicaToken }`.

**Step 2: Add Multica event handlers in `onAgentStream`**

Inside the existing reducer (look at the `if (event.type === "stream_event")` chain), add a new branch **before** any fallthrough:

```javascript
if (typeof event.type === "string" && event.type.startsWith("multica:")) {
  const assistant = ensureAssistant();
  const inner = event.type.slice("multica:".length);
  const p = event.payload || {};

  if (inner === "chat:message" && p.role === "user") {
    // Server echoes the user message — already appended locally; ignore.
    return next;
  }

  if (inner === "task:message") {
    const part = mapMulticaTaskMessage(p);
    if (!part) return next;
    const parts = [...(assistant.parts || []), part];
    msgs[msgs.length - 1] = { ...assistant, parts, isStreaming: true };
    next.set(conversationId, { ...convo, messages: msgs, isStreaming: true });
    return next;
  }

  if (inner === "agent:status") {
    // Broadcast so the picker can refresh tags. Don't mutate the transcript.
    window.dispatchEvent(new CustomEvent("multica-agent-status", { detail: p.agent }));
    return next;
  }

  if (inner === "chat:done" || inner === "task:completed") {
    msgs[msgs.length - 1] = freezeElapsed({ ...assistant, isStreaming: false });
    next.set(conversationId, { ...convo, messages: msgs, isStreaming: false });
    return next;
  }

  if (inner === "task:failed" || inner === "task:cancelled" || inner === "error") {
    msgs[msgs.length - 1] = freezeElapsed({
      ...assistant, isStreaming: false,
      parts: [...(assistant.parts || []), { type: "text", text: `_Multica ${inner}: ${p.message || p.reason || ""}_` }],
    });
    next.set(conversationId, { ...convo, messages: msgs, isStreaming: false, error: p.message || inner });
    return next;
  }

  return next;
}
```

Add near the top of the file:

```javascript
function mapMulticaTaskMessage(p) {
  switch (p.type) {
    case "text": return { type: "text", text: p.content || "" };
    case "tool_use": return { type: "tool_use", name: p.tool, args: p.input || {} };
    case "tool_result": return { type: "tool_result", name: p.tool, result: p.output || "" };
    case "error": return { type: "text", text: `_${p.content || "error"}_` };
    default: return null;
  }
}
```

**Step 3: Smoke test**

With the app running and Multica configured: new chat with a Multica agent → send "Reply in one short sentence." → you should see the assistant bubble populate from the `task:message(text)` event and complete on `chat:done`. The agent-status picker tag should flip from `IDLE` to `WORKING` and back.

**Step 4: Commit**

```bash
git add src/hooks/useAgent.js src/App.jsx
git commit -m "feat(multica): normalize WS events into assistant parts"
```

---

### Task 4.4: Agent-status tag updates in the picker

**Files:**
- Modify: `src/data/multicaModels.js` (`useMulticaModels` hook)

**Step 1: Listen for the custom event and patch the models list in place**

```javascript
useEffect(() => {
  const h = (e) => {
    const agent = e.detail;
    if (!agent?.id) return;
    setModels((prev) => prev.map((m) => m.agentId === agent.id
      ? { ...m, tag: (agent.status || "unknown").toUpperCase(), status: agent.status }
      : m));
  };
  window.addEventListener("multica-agent-status", h);
  return () => window.removeEventListener("multica-agent-status", h);
}, []);
```

**Step 2: Commit**

```bash
git add src/data/multicaModels.js
git commit -m "feat(multica): live agent status tag updates"
```

---

## Phase 5 — Persistence and polish

### Task 5.1: Persist `_multica` across app restart

**Files:**
- Modify: wherever conversations are serialized to disk (search for `convoList` persistence — likely in `App.jsx` or a hook). Use `Grep` for `convoList` + `localStorage`/`ipcRenderer.invoke.*save`/similar.

**Step 1: Ensure `_multica` is included in the persisted shape**

Serialization tends to include all own properties. If there's an allowlist, add `_multica`. Add a test or manually verify by quit/relaunch.

**Step 2: On app boot, re-subscribe existing Multica conversations**

When a conversation with `_multica` is active and `isStreaming` is false, we don't need to do anything until the user sends. When it's `isStreaming` (e.g. app closed mid-task), attempt to reconnect — Phase 5.2.

**Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "fix(multica): persist _multica context across restarts"
```

---

### Task 5.2: Manual backfill button when a user reopens a Multica chat

**Files:**
- Modify: `src/components/ChatArea.jsx` (wherever error/reconnect UI lives — if none exists, pick the parent that already has `cwd` and `conversation`)
- Add a helper `multicaListMessages` IPC

**Step 1: REST passthrough**

```javascript
// electron/multica-manager.cjs
async function multicaListMessages({ serverUrl, token, workspaceSlug, sessionId }) {
  return rest({ serverUrl, method: "GET", path: `/api/chat/sessions/${sessionId}/messages`, token, workspaceSlug });
}
module.exports.multicaListMessages = multicaListMessages;
```

Add IPC + preload as in Task 1.2.

**Step 2: Reconnect button**

When `conversation._multica` exists and the WS pool has no subscription for this conversation, show a subtle "Reconnect" pill at the bottom of the transcript. Clicking it re-registers the subscription in main (add a new IPC like `multica-subscribe`) and calls `multicaListMessages` to backfill anything missed.

v1 MVP: only do the backfill-on-click path. No automatic reconnect.

**Step 3: Commit**

```bash
git add electron/multica-manager.cjs electron/main.cjs electron/preload.cjs src/components/ChatArea.jsx
git commit -m "feat(multica): manual reconnect + message backfill"
```

---

### Task 5.3: Model-picker empty-state polish + error surfacing

**Files:**
- Modify: `src/components/ModelPicker.jsx`
- Modify: `src/data/multicaModels.js`

**Step 1:**

- If `loading` is true on first render (no cache), show `Loading agents…` row.
- If `error?.status === 401`, show `Session expired — reconnect` that opens the setup modal.
- If `error?.status === 403 || 404`, show the error text verbatim.

**Step 2: Commit**

```bash
git add src/components/ModelPicker.jsx src/data/multicaModels.js
git commit -m "polish(multica): picker loading + error states"
```

---

### Task 5.4: End-to-end manual test checklist

**Files:**
- Create: `docs/plans/2026-04-20-multica-e2e-checklist.md`

**Step 1: Write a short checklist**

```markdown
# Multica E2E manual test — 2026-04-20

- [ ] Fresh install (clear localStorage multica.v1) → model picker shows `MULTICA → Connect Multica…`.
- [ ] Complete setup against `https://srv1309901.tail96f1f.ts.net` with `dev@localhost` + `888888`.
- [ ] Picker now lists agents with status tags.
- [ ] New chat:
  - Pick Multica agent `Claude`
  - Toggle Tree (worktree) on
  - Enter short prompt
  - Confirm → branch is pushed (verify with `git branch -r | grep <name>`)
  - `task:message(text)` streams into the assistant bubble
  - `chat:done` flips `isStreaming` off
- [ ] Three parallel chats on mac/linux/win agents each get their own branch and worktree.
- [ ] Switching the model in the picker to Claude Opus (mid-chat) cancels any running Multica task and drives the tab with Claude on the same worktree.
- [ ] Multica's pushed commits appear as ↑N in `GitStatusPill`; pull works.
- [ ] After quit/relaunch, previously-created Multica conversations reload and show a Reconnect pill if they had unfinished tasks.
- [ ] 401 surfaces as "Session expired — reconnect."
```

**Step 2: Commit**

```bash
git add docs/plans/2026-04-20-multica-e2e-checklist.md
git commit -m "docs: Multica E2E manual test checklist"
```

---

## Risks and open verification items (roll-up)

- **Repo binding**: `TaskDispatchPayload` has no repo field. The prompt-prefix "work on branch X" is our way of telling the daemon. **Verify during Phase 4 smoke test**: if the Multica runtime checks out the named branch and pushes to it, we're fine. If not, the branch directive needs to go through a different channel (escalate — don't paper over).
- **Auth rate limit**: `/auth/send-code` is throttled (~60s per email). Surface the server's message verbatim in the setup modal and let the user wait; don't retry automatically.
- **`task:message` ordering**: real stream showed `seq` starting at 1, monotonic. Don't reorder; append in arrival order. Drop duplicates by seq if we ever see one.
- **`chat:done` is empty**: final text lives in `task:message(text)`. Do NOT render `chat:done.content`.
- **Workspace slug vs id**: server accepts either. We store slug because it's user-visible; we keep id for the WS query param (only accepts id).

---

## Out-of-scope for v1 (confirmed with user)

- Multi-user workspace switching UI.
- Automatic WS reconnection with backoff.
- Inline per-turn cancellation UI.
- Filtering agents by repo / remote URL.
- Creating or editing Multica agents from RayLine.

---

## Completion bar

Feature is done when the E2E checklist in Task 5.4 passes and the parallel-3-OS scenario from the brainstorm works end to end without manual terminal intervention.
