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
