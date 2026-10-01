import type { WebContents } from "electron";
import type {
  AgentDonePayload,
  AgentErrorPayload,
  AgentStreamPayload,
} from "@shared/agent/events";
import type { AgentPermissionCancelled, AgentPermissionRequest } from "@shared/chat/types";

/**
 * Where an agent provider (Claude / Codex / OpenCode / Multica) delivers its
 * events. Providers depend only on this interface — never on Electron's
 * WebContents — so they can be driven by tests or other transports.
 */
export interface AgentEventSink {
  readonly isClosed: () => boolean;
  readonly stream: (payload: AgentStreamPayload) => void;
  readonly done: (payload: AgentDonePayload) => void;
  readonly error: (payload: AgentErrorPayload) => void;
  readonly permissionRequest: (payload: AgentPermissionRequest) => void;
  readonly permissionCancelled: (payload: AgentPermissionCancelled) => void;
}

/** Adapts a renderer's WebContents to the typed agent event channels. */
export function webContentsSink(webContents: WebContents): AgentEventSink {
  const send = (channel: string, payload: unknown): void => {
    if (!webContents.isDestroyed()) webContents.send(channel, payload);
  };
  return {
    isClosed: () => webContents.isDestroyed(),
    stream: (payload) => send("agent-stream", payload),
    done: (payload) => send("agent-done", payload),
    error: (payload) => send("agent-error", payload),
    permissionRequest: (payload) => send("agent-permission-request", payload),
    permissionCancelled: (payload) => send("agent-permission-cancelled", payload),
  };
}
