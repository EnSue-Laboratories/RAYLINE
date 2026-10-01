/**
 * One authenticated WebSocket per (server, workspace), shared by every
 * conversation bound to that workspace, plus per-conversation subscriptions
 * and task cancellation.
 */

import WebSocket from "ws";
import type { MulticaWsMessage } from "@shared/agent/events";
import type { AgentEventSink } from "../../agent-sink";
import { donePayload } from "../common/done";
import { errorMessage } from "../common/json";
import { multicaCancelTask, multicaGetPendingTaskId } from "./api";
import { exitCodeForTerminal, parseMulticaWsMessage, routeMulticaMessage, toMulticaStreamEvent } from "./ws-messages";

const PROVIDER = "multica";

export interface MulticaSubscription {
  readonly conversationId: string;
  readonly sessionId: string;
  readonly workspaceSlug: string;
  readonly sink: AgentEventSink;
  taskId: string | null;
  /** The send-message REST call returned (so a no-op cancel can finish the run). */
  startRequestComplete: boolean;
  cancelRequested: boolean;
  cancelPromise: Promise<boolean> | null;
  doneEmitted: boolean;
}

export interface MulticaPoolEntry {
  readonly ws: WebSocket;
  readonly subscriptions: Map<string, MulticaSubscription>;
  readonly ready: Promise<void>;
  serverUrl: string;
  workspaceId: string;
  token: string;
}

const wsPool = new Map<string, MulticaPoolEntry>();

function wsKey(serverUrl: string, workspaceId: string): string {
  return `${serverUrl}#${workspaceId}`;
}

export function emitMulticaError(sub: MulticaSubscription, message: string): void {
  sub.sink.stream({ conversationId: sub.conversationId, event: { type: "multica:error", payload: { message } } });
}

export function emitMulticaDone(sub: MulticaSubscription, exitCode: number | null, signal: string | null = null): void {
  if (sub.doneEmitted) return;
  sub.doneEmitted = true;
  sub.sink.done(donePayload(PROVIDER, sub.conversationId, exitCode, { signal }));
}

async function ensureTaskId(entry: MulticaPoolEntry, sub: MulticaSubscription): Promise<string | null> {
  if (sub.taskId) return sub.taskId;
  if (!sub.sessionId) return null;
  const taskId = await multicaGetPendingTaskId({
    serverUrl: entry.serverUrl,
    token: entry.token,
    workspaceId: entry.workspaceId,
    workspaceSlug: sub.workspaceSlug,
    sessionId: sub.sessionId,
  });
  if (taskId) sub.taskId = taskId;
  return taskId;
}

/** Cancels the subscription's task (deduplicated). True when the server accepted it. */
export function requestTaskCancel(entry: MulticaPoolEntry, sub: MulticaSubscription): Promise<boolean> {
  sub.cancelRequested = true;
  if (sub.cancelPromise) return sub.cancelPromise;
  sub.cancelPromise = (async () => {
    try {
      const taskId = await ensureTaskId(entry, sub);
      if (!taskId) return false;
      return await multicaCancelTask({
        serverUrl: entry.serverUrl,
        token: entry.token,
        workspaceId: entry.workspaceId,
        workspaceSlug: sub.workspaceSlug,
        taskId,
      });
    } finally {
      sub.cancelPromise = null;
    }
  })();
  return sub.cancelPromise;
}

/** Fire-and-forget cancel that reports failures on the stream. */
export function retryPendingCancel(entry: MulticaPoolEntry, sub: MulticaSubscription): void {
  requestTaskCancel(entry, sub).catch((err: unknown) => emitMulticaError(sub, errorMessage(err)));
}

function dispatch(entry: MulticaPoolEntry, message: MulticaWsMessage): void {
  for (const sub of entry.subscriptions.values()) {
    const route = routeMulticaMessage(message, sub);
    if (route.adoptTaskId) {
      sub.taskId = route.adoptTaskId;
      if (sub.cancelRequested && !sub.cancelPromise) retryPendingCancel(entry, sub);
    }
    if (!route.deliver) continue;
    sub.sink.stream({ conversationId: sub.conversationId, event: toMulticaStreamEvent(message) });
    if (route.clearsTask) {
      sub.taskId = null;
      sub.cancelRequested = false;
      sub.cancelPromise = null;
    }
    if (route.terminal) emitMulticaDone(sub, exitCodeForTerminal(route.terminal), route.terminal === "task:cancelled" ? "SIGTERM" : null);
  }
}

function rawDataToString(raw: WebSocket.RawData): string {
  if (Array.isArray(raw)) return Buffer.concat(raw).toString("utf8");
  return Buffer.isBuffer(raw) ? raw.toString("utf8") : Buffer.from(raw).toString("utf8");
}

function openEntry(key: string, serverUrl: string, workspaceId: string, token: string): MulticaPoolEntry {
  const ws = new WebSocket(`${serverUrl.replace(/^http/, "ws")}/ws?workspace_id=${workspaceId}`);
  let settled = false;
  let resolveReady: () => void = () => {};
  let rejectReady: (err: Error) => void = () => {};
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const settle = (err?: Error): void => {
    if (settled) return;
    settled = true;
    if (!err) {
      resolveReady();
      return;
    }
    try {
      ws.close();
    } catch {
      // already closed
    }
    rejectReady(err);
  };
  const entry: MulticaPoolEntry = { ws, subscriptions: new Map(), ready, serverUrl, workspaceId, token };

  ws.once("open", () => ws.send(JSON.stringify({ type: "auth", payload: { token } })));
  ws.on("message", (raw: WebSocket.RawData) => {
    const message = parseMulticaWsMessage(rawDataToString(raw));
    if (!message) return;
    if (!settled) {
      if (message.type === "auth_ack") return settle();
      if (message.error) return settle(new Error(message.error));
    }
    dispatch(entry, message);
  });
  ws.once("error", (err: Error) => settle(err));
  ws.once("close", () => {
    if (wsPool.get(key) === entry) wsPool.delete(key);
    // Reject pending opens so concurrent awaiters don't hang forever.
    settle(new Error("multica ws closed before auth_ack"));
    // TODO: reconnect with backoff (renderer offers a Reconnect pill today).
  });
  return entry;
}

/** Pooled socket for the workspace (opening + authenticating it if needed). */
export async function getOrOpenWS(serverUrl: string, workspaceId: string, token: string): Promise<MulticaPoolEntry> {
  const key = wsKey(serverUrl, workspaceId);
  let entry = wsPool.get(key);
  if (entry) {
    // Callers await `ready`: two chats can open the same workspace concurrently.
    entry.serverUrl = serverUrl || entry.serverUrl;
    entry.workspaceId = workspaceId || entry.workspaceId;
    entry.token = token || entry.token;
  } else {
    entry = openEntry(key, serverUrl, workspaceId, token);
    wsPool.set(key, entry);
  }
  await entry.ready;
  return entry;
}

export function findSubscriptions(conversationId: string): { entry: MulticaPoolEntry; sub: MulticaSubscription }[] {
  const matches: { entry: MulticaPoolEntry; sub: MulticaSubscription }[] = [];
  for (const entry of wsPool.values()) {
    const sub = entry.subscriptions.get(conversationId);
    if (sub) matches.push({ entry, sub });
  }
  return matches;
}
