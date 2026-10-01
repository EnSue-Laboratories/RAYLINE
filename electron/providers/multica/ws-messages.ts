/**
 * Pure Multica WebSocket frame parsing and per-conversation routing.
 *
 * Events are workspace-scoped: one socket serves every conversation bound to
 * the workspace, so each frame is routed to the subscriptions whose chat
 * session (or in-flight task) it belongs to. `agent:status` is broadcast.
 */

import type { MulticaStreamEvent, MulticaWsMessage, MulticaWsPayload } from "@shared/agent/events";
import { isRecord, safeJsonParse } from "../common/json";

/** Fields used for routing must be strings when present. */
const ROUTING_FIELDS = ["chat_session_id", "session_id", "task_id"] as const;

/**
 * Shallow check: routing ids are validated; the remaining fields come from
 * the server and are forwarded verbatim for the renderer to probe.
 */
export function isMulticaWsPayload(value: unknown): value is MulticaWsPayload {
  if (!isRecord(value)) return false;
  return ROUTING_FIELDS.every((key) => value[key] === undefined || value[key] === null || typeof value[key] === "string");
}

/** Raw WS data → frame; null for non-JSON or frames without a string `type`/`error`. */
export function parseMulticaWsMessage(raw: string): MulticaWsMessage | null {
  const value = safeJsonParse(raw);
  if (!isRecord(value)) return null;
  const type = typeof value.type === "string" ? value.type : "";
  const error = typeof value.error === "string" ? value.error : undefined;
  if (!type && !error) return null;
  const message: MulticaWsMessage = { type };
  if (isMulticaWsPayload(value.payload)) message.payload = value.payload;
  if (error) message.error = error;
  return message;
}

export type MulticaTerminalType = "task:completed" | "task:failed" | "task:cancelled";

export function isMulticaTerminalType(type: string): type is MulticaTerminalType {
  return type === "task:completed" || type === "task:failed" || type === "task:cancelled";
}

/** `agent-done` exit code for a terminal task event. */
export function exitCodeForTerminal(type: MulticaTerminalType): number | null {
  switch (type) {
    case "task:completed":
      return 0;
    case "task:failed":
      return 1;
    case "task:cancelled":
      return null;
    default: {
      const exhaustive: never = type;
      return exhaustive;
    }
  }
}

export interface MulticaRouteTarget {
  sessionId: string;
  taskId: string | null;
}

export interface MulticaRoute {
  /** Forward the frame to this conversation. */
  deliver: boolean;
  /** The frame names this conversation's task (adopt it as current). */
  adoptTaskId: string | null;
  /** Task finished (`chat:done` / `task:*`): clear task + cancel state. */
  clearsTask: boolean;
  /** Terminal task event: emit `agent-done`. */
  terminal: MulticaTerminalType | null;
}

export function routeMulticaMessage(message: MulticaWsMessage, target: MulticaRouteTarget): MulticaRoute {
  const payload = message.payload;
  const sid = payload?.chat_session_id || payload?.session_id;
  const taskId = payload?.task_id || null;
  const sessionMatches = Boolean(sid) && sid === target.sessionId;
  const adoptTaskId = taskId && sessionMatches ? taskId : null;
  const currentTaskId = adoptTaskId ?? target.taskId;
  const deliver = message.type === "agent:status" || sessionMatches || Boolean(taskId && currentTaskId && taskId === currentTaskId);
  if (!deliver) return { deliver, adoptTaskId, clearsTask: false, terminal: null };
  const terminal = isMulticaTerminalType(message.type) ? message.type : null;
  return { deliver, adoptTaskId, clearsTask: message.type === "chat:done" || terminal !== null, terminal };
}

export function toMulticaStreamEvent(message: MulticaWsMessage): MulticaStreamEvent {
  return { type: `multica:${message.type}`, payload: message.payload ?? {} };
}
