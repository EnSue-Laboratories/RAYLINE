"use strict";
// Multica remote-agent manager.
//
// Owns: one WebSocket per (server, workspace) — shared across all conversations
// bound to that workspace — plus REST helpers for auth, workspace discovery,
// agent list, chat-session create, message send.
//
// Delivers events through `window.api.onAgentStream` so useAgent.js can handle
// them identically to Claude/Codex after a thin mapping step.

const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { URL } = require("node:url");
const https = require("node:https");
const http = require("node:http");
const WebSocket = require("ws");

function rest({ serverUrl, method = "GET", path, token, workspaceId, workspaceSlug, body }) {
  return new Promise((resolve, reject) => {
    const u = new URL(path, serverUrl);
    const mod = u.protocol === "http:" ? http : https;
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (workspaceId) headers["X-Workspace-ID"] = workspaceId;
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

function restMultipart({ serverUrl, method = "POST", path: requestPath, token, workspaceId, workspaceSlug, file }) {
  return new Promise((resolve, reject) => {
    const u = new URL(requestPath, serverUrl);
    const mod = u.protocol === "http:" ? http : https;
    const safeFilename = String(file?.filename || "attachment")
      .replace(/[\r\n"]/g, "_")
      .slice(0, 240) || "attachment";
    const contentType = file?.contentType || "application/octet-stream";
    const data = Buffer.isBuffer(file?.data) ? file.data : Buffer.from(file?.data || "");
    const boundary = `----rayline-multica-${crypto.randomUUID()}`;
    const preamble = Buffer.from(
      `--${boundary}\r\n`
      + `Content-Disposition: form-data; name="file"; filename="${safeFilename}"\r\n`
      + `Content-Type: ${contentType}\r\n\r\n`,
      "utf8"
    );
    const epilogue = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
    const payload = Buffer.concat([preamble, data, epilogue]);
    const headers = {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "Content-Length": payload.length,
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (workspaceId) headers["X-Workspace-ID"] = workspaceId;
    if (workspaceSlug) headers["X-Workspace-Slug"] = workspaceSlug;

    const req = mod.request(
      { method, hostname: u.hostname, port: u.port, path: u.pathname + u.search, headers },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("error", reject);
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          const isJson = (res.headers["content-type"] || "").startsWith("application/json");
          let parsed = null;
          if (text) {
            if (isJson) {
              try { parsed = JSON.parse(text); }
              catch (e) { return reject(new Error(`multica ${method} ${requestPath}: invalid JSON response: ${e.message}`)); }
            } else {
              parsed = text;
            }
          }
          if (res.statusCode >= 400) {
            const err = new Error(`multica ${method} ${requestPath} ${res.statusCode}: ${typeof parsed === "string" ? parsed : JSON.stringify(parsed)}`);
            err.status = res.statusCode;
            err.body = parsed;
            return reject(err);
          }
          resolve(parsed);
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(15000, () => {
      req.destroy(new Error(`multica ${method} ${requestPath} timed out after 15s`));
    });
    req.write(payload);
    req.end();
  });
}

function guessExtension(contentType) {
  const normalized = String(contentType || "").toLowerCase();
  switch (normalized) {
    case "image/jpeg": return "jpg";
    case "image/png": return "png";
    case "image/gif": return "gif";
    case "image/webp": return "webp";
    case "image/svg+xml": return "svg";
    case "application/pdf": return "pdf";
    case "text/plain": return "txt";
    case "application/json": return "json";
    default: {
      const [, subtype = "bin"] = normalized.match(/^[^/]+\/(.+)$/) || [];
      return subtype.replace(/[^a-z0-9.+-]+/gi, "").split("+")[0] || "bin";
    }
  }
}

function parseDataUrl(dataUrl) {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
    throw new Error("expected a data URL");
  }
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex === -1) throw new Error("invalid data URL");
  const meta = dataUrl.slice(5, commaIndex);
  const payload = dataUrl.slice(commaIndex + 1);
  const parts = meta.split(";");
  const contentType = parts[0] || "application/octet-stream";
  const isBase64 = parts.includes("base64");
  const data = isBase64
    ? Buffer.from(payload, "base64")
    : Buffer.from(decodeURIComponent(payload), "utf8");
  return { contentType, data };
}

function normalizeAttachmentFilename(filename, fallbackPrefix, contentType, index) {
  const raw = typeof filename === "string" ? filename.trim() : "";
  if (raw) return path.basename(raw);
  return `${fallbackPrefix}-${index + 1}.${guessExtension(contentType)}`;
}

async function loadMulticaUpload(entry, index, kind) {
  if (kind === "image") {
    if (entry && typeof entry === "object" && typeof entry.path === "string" && entry.path) {
      const data = await fs.readFile(entry.path);
      const ext = path.extname(entry.path).toLowerCase();
      const contentType =
        ext === ".png" ? "image/png"
          : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg"
            : ext === ".gif" ? "image/gif"
              : ext === ".webp" ? "image/webp"
                : ext === ".svg" ? "image/svg+xml"
                  : "application/octet-stream";
      return {
        filename: normalizeAttachmentFilename(entry.name || entry.path, "image", contentType, index),
        contentType,
        data,
      };
    }
    const dataUrl =
      typeof entry === "string"
        ? entry
        : (typeof entry?.dataUrl === "string" ? entry.dataUrl : "");
    if (!dataUrl) {
      throw new Error(`attached image ${index + 1} is missing data`);
    }
    const parsed = parseDataUrl(dataUrl);
    return {
      filename: normalizeAttachmentFilename(entry?.name, "image", parsed.contentType, index),
      contentType: parsed.contentType,
      data: parsed.data,
    };
  }

  const filePath = typeof entry?.path === "string" ? entry.path : "";
  if (!filePath) {
    throw new Error(`attached file ${index + 1} is missing a readable path`);
  }
  const data = await fs.readFile(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const contentType =
    ext === ".png" ? "image/png"
      : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg"
        : ext === ".gif" ? "image/gif"
          : ext === ".webp" ? "image/webp"
            : ext === ".svg" ? "image/svg+xml"
              : ext === ".pdf" ? "application/pdf"
                : ext === ".json" ? "application/json"
                  : ext === ".txt" || ext === ".md" ? "text/plain"
                    : "application/octet-stream";
  return {
    filename: normalizeAttachmentFilename(entry?.name || filePath, "file", contentType, index),
    contentType,
    data,
  };
}

async function uploadMulticaAttachment({ serverUrl, token, workspaceId, workspaceSlug, upload }) {
  return restMultipart({
    serverUrl,
    method: "POST",
    path: "/api/upload-file",
    token,
    workspaceId,
    workspaceSlug,
    file: upload,
  });
}

async function uploadMulticaAttachments({ serverUrl, token, workspaceId, workspaceSlug, images, files }) {
  const uploaded = [];

  for (let i = 0; i < (Array.isArray(images) ? images.length : 0); i += 1) {
    const upload = await loadMulticaUpload(images[i], i, "image");
    const response = await uploadMulticaAttachment({ serverUrl, token, workspaceId, workspaceSlug, upload });
    if (!response?.id) {
      throw new Error(`Multica uploaded image '${upload.filename}' but did not return an attachment id`);
    }
    uploaded.push({
      kind: "image",
      id: response.id,
      filename: response?.filename || upload.filename,
      contentType: response?.content_type || upload.contentType,
      sizeBytes: Number.isFinite(response?.size_bytes) ? response.size_bytes : upload.data.length,
    });
  }

  for (let i = 0; i < (Array.isArray(files) ? files.length : 0); i += 1) {
    const upload = await loadMulticaUpload(files[i], i, "file");
    const response = await uploadMulticaAttachment({ serverUrl, token, workspaceId, workspaceSlug, upload });
    if (!response?.id) {
      throw new Error(`Multica uploaded file '${upload.filename}' but did not return an attachment id`);
    }
    uploaded.push({
      kind: "file",
      id: response.id,
      filename: response?.filename || upload.filename,
      contentType: response?.content_type || upload.contentType,
      sizeBytes: Number.isFinite(response?.size_bytes) ? response.size_bytes : upload.data.length,
    });
  }

  return uploaded;
}

function buildMulticaAttachmentPrompt(prompt, attachments) {
  const usable = Array.isArray(attachments) ? attachments.filter((item) => item?.id) : [];
  if (usable.length === 0) return prompt;

  const lines = [
    "<rayline-multica-attachments>",
    "RayLine uploaded attachments for this user message.",
    "These files are available as Multica workspace attachments.",
    "Use `multica attachment download <attachment-id>` to fetch one locally before answering if you need to inspect it.",
    "Do not claim you inspected an attachment unless you actually downloaded or opened it in the runtime.",
    "Attachments:",
    ...usable.map((item) => (
      `- ${item.kind}: ${item.filename} (attachment_id: ${item.id}${item.contentType ? `, content_type: ${item.contentType}` : ""}${Number.isFinite(item.sizeBytes) ? `, size_bytes: ${item.sizeBytes}` : ""})`
    )),
    "Do not quote this block back unless the user explicitly asks.",
    "</rayline-multica-attachments>",
  ];

  return `${lines.join("\n")}\n\n${prompt || ""}`.trim();
}

module.exports = {
  startMulticaAgent,
  cancelMulticaAgent,
  subscribeMulticaAgent,
  // Setup-flow helpers (called directly via ipcMain.handle, not via agent-start)
  multicaSendCode,
  multicaVerifyCode,
  multicaListWorkspaces,
  multicaListAgents,
  multicaEnsureSession, // used by handleCreateChat to create a session + push branch
  multicaListMessages,
};

// Map<string, { ws, ready: Promise<void>, subscriptions: Map<conversationId, {sessionId, sender, taskId}> }>
const wsPool = new Map();

function wsKey({ serverUrl, workspaceId }) {
  return `${serverUrl}#${workspaceId}`;
}

async function getOrOpenWS({ serverUrl, workspaceId, token }) {
  const key = wsKey({ serverUrl, workspaceId });
  // Return any pooled entry (CONNECTING or OPEN); callers await entry.ready
  // before using it. Re-entrancy matters: two chats can fire concurrently.
  const existing = wsPool.get(key);
  if (existing) {
    existing.serverUrl = serverUrl || existing.serverUrl;
    existing.workspaceId = workspaceId || existing.workspaceId;
    existing.token = token || existing.token;
    await existing.ready;
    return existing;
  }

  const wsURL = serverUrl.replace(/^http/, "ws") + `/ws?workspace_id=${workspaceId}`;
  const ws = new WebSocket(wsURL);
  const entry = { ws, subscriptions: new Map(), ready: null, serverUrl, workspaceId, token };
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

function emitMulticaStream(sub, conversationId, event) {
  try {
    sub.sender.send("agent-stream", { conversationId, event });
  } catch { /* sender destroyed */ }
}

function emitMulticaDone(sub, conversationId) {
  if (sub.doneEmitted) return;
  sub.doneEmitted = true;
  try {
    sub.sender.send("agent-done", { conversationId, provider: "multica" });
  } catch { /* sender destroyed */ }
}

function clearMulticaSubscription(entry, conversationId) {
  if (!entry?.subscriptions) return;
  entry.subscriptions.delete(conversationId);
}

function clearMatchedSubscription(entry, conversationId, sub) {
  if (entry?.subscriptions?.get(conversationId) !== sub) return;
  clearMulticaSubscription(entry, conversationId);
}

async function multicaGetPendingTask({ serverUrl, token, workspaceId, workspaceSlug, sessionId }) {
  return rest({
    serverUrl,
    method: "GET",
    path: `/api/chat/sessions/${sessionId}/pending-task`,
    token,
    workspaceId,
    workspaceSlug,
  });
}

async function multicaCancelTask({ serverUrl, token, workspaceId, workspaceSlug, taskId }) {
  return rest({
    serverUrl,
    method: "POST",
    path: `/api/tasks/${taskId}/cancel`,
    token,
    workspaceId,
    workspaceSlug,
  });
}

async function ensureMulticaTaskId(entry, sub) {
  if (sub.taskId) return sub.taskId;
  if (!sub.sessionId) return null;
  try {
    const pending = await multicaGetPendingTask({
      serverUrl: entry.serverUrl,
      token: entry.token,
      workspaceId: entry.workspaceId,
      workspaceSlug: sub.workspaceSlug,
      sessionId: sub.sessionId,
    });
    if (pending?.task_id) {
      sub.taskId = pending.task_id;
      return sub.taskId;
    }
    return null;
  } catch (err) {
    if (err?.status === 404) return null;
    throw err;
  }
}

async function requestTaskCancel(entry, sub) {
  sub.cancelRequested = true;
  if (sub.cancelPromise) return sub.cancelPromise;

  sub.cancelPromise = (async () => {
    const taskId = await ensureMulticaTaskId(entry, sub);
    if (!taskId) return false;
    try {
      await multicaCancelTask({
        serverUrl: entry.serverUrl,
        token: entry.token,
        workspaceId: entry.workspaceId,
        workspaceSlug: sub.workspaceSlug,
        taskId,
      });
      return true;
    } catch (err) {
      if (err?.status === 404 || err?.status === 409) return false;
      throw err;
    } finally {
      sub.cancelPromise = null;
    }
  })();

  return sub.cancelPromise;
}

function dispatchWSMessage(key, msg) {
  const entry = wsPool.get(key);
  if (!entry) return;
  const { type, payload } = msg;
  // Events are workspace-scoped; fan out to all subs that match session_id
  for (const [conversationId, sub] of entry.subscriptions.entries()) {
    const sid = payload?.chat_session_id || payload?.session_id;
    const taskId = payload?.task_id;
    const sessionMatches = sid === sub.sessionId;
    if (taskId && sessionMatches) {
      sub.taskId = taskId;
      if (sub.cancelRequested && !sub.cancelPromise) {
        requestTaskCancel(entry, sub).catch((err) => {
          emitMulticaStream(sub, conversationId, {
            type: "multica:error",
            payload: { message: err?.message || String(err) },
          });
        });
      }
    }
    // agent:status is workspace-scoped (fan out to all subs). Everything else
    // is gated by session id or current task id match.
    const isBroadcast =
      type === "agent:status" ||
      sessionMatches ||
      Boolean(taskId && sub.taskId && taskId === sub.taskId);
    if (!isBroadcast) continue;
    emitMulticaStream(sub, conversationId, { type: `multica:${type}`, payload });
    if (type === "chat:done" || type === "task:completed" || type === "task:failed" || type === "task:cancelled") {
      sub.taskId = null;
      sub.cancelRequested = false;
      sub.cancelPromise = null;
    }
    if (type === "task:completed" || type === "task:failed" || type === "task:cancelled") {
      emitMulticaDone(sub, conversationId);
      clearMatchedSubscription(entry, conversationId, sub);
    }
  }
}

async function startMulticaAgent(opts, sender) {
  const { conversationId, prompt, images, files, _multica } = opts;
  if (!_multica) throw new Error("startMulticaAgent: missing _multica context");
  const { serverUrl, workspaceId, workspaceSlug, sessionId } = _multica;
  const token = opts._multicaToken; // passed by useAgent from store
  if (!token) throw new Error("startMulticaAgent: missing token");

  const entry = await getOrOpenWS({ serverUrl, workspaceId, token });
  entry.subscriptions.set(conversationId, {
    sessionId,
    sender,
    taskId: null,
    workspaceSlug,
    startRequestComplete: false,
    cancelRequested: false,
    cancelPromise: null,
    doneEmitted: false,
  });

  try {
    const attachments = await uploadMulticaAttachments({
      serverUrl,
      token,
      workspaceId,
      workspaceSlug,
      images,
      files,
    });
    const content = buildMulticaAttachmentPrompt(prompt, attachments);

    // Fire the message via REST — the actual content comes back over WS
    const sendResult = await multicaSendMessage({ serverUrl, token, workspaceId, workspaceSlug, sessionId, content });
    const sub = entry.subscriptions.get(conversationId);
    if (sub) {
      sub.startRequestComplete = true;
      sub.taskId = sendResult?.task_id || sub.taskId || null;
      if (sub.cancelRequested) {
        requestTaskCancel(entry, sub).catch((err) => {
          emitMulticaStream(sub, conversationId, {
            type: "multica:error",
            payload: { message: err?.message || String(err) },
          });
        });
      }
    }
  } catch (err) {
    clearMulticaSubscription(entry, conversationId);
    throw err;
  }
}

async function cancelMulticaAgent(conversationId) {
  const matches = [];
  for (const entry of wsPool.values()) {
    const sub = entry.subscriptions.get(conversationId);
    if (sub) matches.push({ entry, sub });
  }
  if (matches.length === 0) return;

  await Promise.all(matches.map(async ({ entry, sub }) => {
    try {
      const didCancel = await requestTaskCancel(entry, sub);
      if (!didCancel && sub.startRequestComplete) {
        emitMulticaDone(sub, conversationId);
        clearMatchedSubscription(entry, conversationId, sub);
      }
    } catch (err) {
      emitMulticaStream(sub, conversationId, {
        type: "multica:error",
        payload: { message: err?.message || String(err) },
      });
      emitMulticaDone(sub, conversationId);
      clearMatchedSubscription(entry, conversationId, sub);
    }
  }));
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

async function multicaListAgents({ serverUrl, token, workspaceId, workspaceSlug }) {
  return rest({ serverUrl, method: "GET", path: "/api/agents", token, workspaceId, workspaceSlug });
}

async function multicaEnsureSession({ serverUrl, token, workspaceId, workspaceSlug, agentId, title }) {
  return rest({
    serverUrl, method: "POST", path: "/api/chat/sessions",
    token, workspaceId, workspaceSlug,
    body: { agent_id: agentId, title: title || "RayLine chat" },
  });
}

async function multicaSendMessage({ serverUrl, token, workspaceId, workspaceSlug, sessionId, content }) {
  return rest({
    serverUrl, method: "POST", path: `/api/chat/sessions/${sessionId}/messages`,
    token, workspaceId, workspaceSlug, body: { content },
  });
}

async function multicaListMessages({ serverUrl, token, workspaceId, workspaceSlug, sessionId }) {
  return rest({
    serverUrl, method: "GET", path: `/api/chat/sessions/${sessionId}/messages`,
    token, workspaceId, workspaceSlug,
  });
}

// Re-register a conversation's WS subscription after the pool was emptied
// (e.g. after app restart, or after a ws close). v1 MVP is click-to-reconnect
// only — the caller is ChatArea's Reconnect pill.
async function subscribeMulticaAgent({ conversationId, _multica, token }, sender) {
  if (!_multica) throw new Error("subscribeMulticaAgent: missing _multica context");
  if (!token) throw new Error("subscribeMulticaAgent: missing token");
  const { serverUrl, workspaceId, workspaceSlug, sessionId } = _multica;
  const entry = await getOrOpenWS({ serverUrl, workspaceId, token });
  entry.subscriptions.set(conversationId, {
    sessionId,
    sender,
    taskId: null,
    workspaceSlug,
    startRequestComplete: true,
    cancelRequested: false,
    cancelPromise: null,
    doneEmitted: false,
  });
}

// Expose sendMessage for startMulticaAgent (added later)
module.exports.multicaSendMessage = multicaSendMessage;
