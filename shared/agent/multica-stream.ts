/**
 * Multica WebSocket events. electron/multica-manager forwards every WS message
 * relevant to a conversation as `{ type: "multica:<ws type>", payload }` on
 * `agent-stream` (every WS type is forwarded, not just the known ones), and
 * main emits `multica:error` itself when a launch fails.
 */

import type { MulticaAgent } from "../providers/types";

/** WS message types the renderer acts on. */
export type MulticaKnownWsEventType =
  | "chat:message"
  | "chat:done"
  | "agent:status"
  | "task:message"
  | "task:completed"
  | "task:failed"
  | "task:cancelled"
  | "error";

export const MULTICA_TERMINAL_EVENT_TYPES: readonly MulticaKnownWsEventType[] = [
  "task:completed",
  "task:failed",
  "task:cancelled",
];

/** `task:message` payload `type`. */
export type MulticaTaskMessageType = "text" | "tool_use" | "tool_result" | "error" | (string & {});

/**
 * Union of the payload fields RayLine reads across Multica WS events.
 * Payloads come from a remote server, so everything is optional.
 */
export interface MulticaWsPayload {
  chat_session_id?: string;
  session_id?: string;
  task_id?: string;
  // chat:message
  role?: string;
  // agent:status
  agent?: MulticaAgent;
  // task:message
  type?: MulticaTaskMessageType;
  content?: string;
  tool?: string;
  input?: Record<string, unknown>;
  output?: string;
  // task:failed / error
  message?: string;
  reason?: string;
}

/** Raw WS frame from the Multica server. */
export interface MulticaWsMessage {
  type: string;
  payload?: MulticaWsPayload;
  error?: string;
}

export interface MulticaStreamEvent {
  type: `multica:${string}`;
  payload: MulticaWsPayload;
}

export const MULTICA_EVENT_PREFIX = "multica:";

/** `multica:task:message` → `task:message`. */
export function getMulticaInnerType(event: MulticaStreamEvent): string {
  return event.type.slice(MULTICA_EVENT_PREFIX.length);
}
