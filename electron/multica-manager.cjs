"use strict";
// Multica remote-agent manager.
//
// Owns: one WebSocket per (server, workspace) — shared across all conversations
// bound to that workspace — plus REST helpers for auth, workspace discovery,
// agent list, chat-session create, message send.
//
// Delivers events through `window.api.onAgentStream` so useAgent.js can handle
// them identically to Claude/Codex after a thin mapping step.

const { URL } = require("node:url");
const https = require("node:https");
const http = require("node:http");
const WebSocket = require("ws");

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
      res.on("error", reject);
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        const isJson = (res.headers["content-type"] || "").startsWith("application/json");
        let data = null;
        if (text) {
          if (isJson) {
            try { data = JSON.parse(text); }
            catch (e) { return reject(new Error(`multica ${method} ${path}: invalid JSON response: ${e.message}`)); }
          } else {
            data = text;
          }
        }
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
    req.setTimeout(15000, () => {
      req.destroy(new Error(`multica ${method} ${path} timed out after 15s`));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

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

// Map<string, { ws, ready: Promise<void>, subscriptions: Map<conversationId, {sessionId, sender}> }>
const wsPool = new Map();

function wsKey({ serverUrl, workspaceId }) {
  return `${serverUrl}#${workspaceId}`;
}

async function getOrOpenWS({ serverUrl, workspaceId, token }) {
  const key = wsKey({ serverUrl, workspaceId });
  // Return any pooled entry (CONNECTING or OPEN); callers await entry.ready
  // before using it. Re-entrancy matters: two chats can fire concurrently.
  const existing = wsPool.get(key);
  if (existing) { await existing.ready; return existing; }

  const wsURL = serverUrl.replace(/^http/, "ws") + `/ws?workspace_id=${workspaceId}`;
  const ws = new WebSocket(wsURL);
  const entry = { ws, subscriptions: new Map(), ready: null };
  entry.ready = new Promise((resolve, reject) => {
    let settled = false;
    const done = (err) => {
      if (settled) return;
      settled = true;
      if (err) { try { ws.close(); } catch { /* already closed */ } reject(err); }
      else resolve();
    };
    ws.once("open", () => {
      ws.send(JSON.stringify({ type: "auth", payload: { token } }));
    });
    ws.on("message", (raw) => {
      let msg; try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (!settled) {
        if (msg.type === "auth_ack") return done();
        if (msg.error) return done(new Error(msg.error));
      }
      dispatchWSMessage(key, msg);
    });
    ws.once("error", (e) => done(e instanceof Error ? e : new Error(String(e))));
    ws.once("close", () => {
      wsPool.delete(key);
      // Reject pending opens so concurrent awaiters don't hang forever.
      done(new Error("multica ws closed before auth_ack"));
      // TODO: reconnect with backoff (Phase 5)
    });
  });
  wsPool.set(key, entry);
  await entry.ready;
  return entry;
}

function dispatchWSMessage(key, msg) {
  const entry = wsPool.get(key);
  if (!entry) return;
  const { type, payload } = msg;
  // Events are workspace-scoped; fan out to all subs that match session_id
  for (const [conversationId, sub] of entry.subscriptions.entries()) {
    const sid = payload?.chat_session_id || payload?.session_id;
    // agent:status is workspace-scoped (fan out to all subs). Everything else
    // is gated by session id match.
    const isBroadcast = type === "agent:status" || sid === sub.sessionId;
    if (!isBroadcast) continue;
    try {
      sub.sender.send("agent-stream", { conversationId, event: { type: `multica:${type}`, payload } });
    } catch { /* sender destroyed */ }
  }
}

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
