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
