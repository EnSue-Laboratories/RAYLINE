/** Builders for the `agent-done` / `agent-error` payloads every provider sends. */

import type { AgentDonePayload } from "@shared/agent/events";
import type { RuntimeProviderId } from "@shared/providers/types";
import type { AgentEventSink } from "../../agent-sink";

export interface DoneDetails {
  signal?: string | null;
  threadId?: string | null;
}

export function donePayload(
  provider: RuntimeProviderId,
  conversationId: string,
  exitCode: number | null,
  details: DoneDetails = {},
): AgentDonePayload {
  return {
    conversationId,
    provider,
    exitCode,
    ...(details.signal !== undefined ? { signal: details.signal } : {}),
    ...(details.threadId !== undefined ? { threadId: details.threadId } : {}),
  };
}

/** `agent-error` followed by `agent-done` with exit code -1. */
export function emitLaunchFailure(
  sink: AgentEventSink,
  provider: RuntimeProviderId,
  conversationId: string,
  error: string,
  details: DoneDetails = {},
): void {
  sink.error({ conversationId, error });
  sink.done(donePayload(provider, conversationId, -1, details));
}

/** `agent-done` for a run cancelled before its process existed. */
export function emitCancelled(sink: AgentEventSink, provider: RuntimeProviderId, conversationId: string, threadId?: string | null): void {
  sink.done(donePayload(provider, conversationId, null, { signal: "SIGTERM", ...(threadId !== undefined ? { threadId } : {}) }));
}
