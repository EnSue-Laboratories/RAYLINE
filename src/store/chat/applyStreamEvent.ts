/**
 * Pure stream reducer: folds ONE `agent-stream` event into a conversation
 * draft. The flush applies every buffered event to the same draft, so each
 * flush copies the conversation / messages / touched message and parts at most
 * once (see draft.ts). Provider branches live in `*Events.ts`.
 */
import { type AgentStreamEvent, getMulticaInnerType, isMulticaStreamEvent } from "@shared/agent/events";
import { ensureAssistantIndex, findLatestAssistantIndex, isRecord } from "./assistant";
import { applyClaudeAssistant, applyClaudeResult, applyClaudeStreamEnvelope, applyClaudeSystem, applyClaudeUser } from "./claudeEvents";
import { applyCodexEventMsg, applyCodexItem, applyCodexResponseItem, applyCodexTurnCompleted } from "./codexEvents";
import type { ConversationDraft } from "./draft";
import { applyMulticaEvent } from "./multicaEvents";
import { applyOpenCodeEvent } from "./openCodeEvents";
import { mergeUsage } from "./usage";

function captureClaudeSessionId(draft: ConversationDraft, event: AgentStreamEvent): void {
  const record: Record<string, unknown> = { ...event };
  const sessionId = record.session_id;
  if (typeof sessionId !== "string" || !sessionId || draft.conversation._claudeSessionId === sessionId) return;
  draft.set("_claudeSessionId", sessionId);
  draft.log("Captured Claude session ID:", {
    conversationId: draft.id,
    sessionId,
    eventType: event.type,
    subtype: typeof record.subtype === "string" ? record.subtype : undefined,
  });
}

export function applyStreamEvent(draft: ConversationDraft, event: AgentStreamEvent): void {
  if (!isRecord(event)) return;
  captureClaudeSessionId(draft, event);

  if (isMulticaStreamEvent(event)) {
    applyMulticaEvent(draft, event);
    return;
  }

  switch (event.type) {
    case "stream_event":
      applyClaudeStreamEnvelope(draft, event);
      return;
    case "assistant":
      applyClaudeAssistant(draft, event);
      return;
    case "user":
      applyClaudeUser(draft, event);
      return;
    case "result":
      applyClaudeResult(draft, event);
      return;
    case "system":
      applyClaudeSystem(draft, event);
      return;

    // Claude plan quota, emitted by main after each `result` (already in the
    // provider-agnostic `{ five_hour, seven_day }` shape).
    case "rate_limits": {
      draft.touch();
      if (!event.rate_limits) return;
      const message = draft.editAssistant(findLatestAssistantIndex(draft.messages));
      if (message) message._rateLimits = event.rate_limits;
      return;
    }
    case "session_snapshot": {
      draft.touch();
      if (event.thread_id) draft.set("_codexThreadId", event.thread_id);
      const message = draft.editAssistant(findLatestAssistantIndex(draft.messages));
      if (!message) return;
      if (event.usage) message._usage = mergeUsage(message._usage, event.usage);
      if (event.rate_limits) message._rateLimits = event.rate_limits;
      return;
    }

    case "step_start":
    case "step_finish":
    case "tool_use":
    case "reasoning":
    case "text":
    case "opencode_stdout":
    case "error":
      applyOpenCodeEvent(draft, event);
      return;

    case "session_meta":
      draft.touch();
      if (!event.payload?.id) return;
      draft.set("_codexThreadId", event.payload.id);
      draft.log("Captured Codex thread ID:", { conversationId: draft.id, threadId: event.payload.id, source: "session_meta" });
      return;
    case "thread.started":
      draft.set("_codexThreadId", event.thread_id);
      draft.log("Captured Codex thread ID:", { conversationId: draft.id, threadId: event.thread_id, source: "thread.started" });
      return;
    case "event_msg":
      applyCodexEventMsg(draft, event);
      return;
    case "turn.started":
      draft.touch();
      ensureAssistantIndex(draft);
      return;
    case "item.started":
    case "item.updated":
    case "item.completed":
      applyCodexItem(draft, event);
      return;
    case "response_item":
      applyCodexResponseItem(draft, event);
      return;
    case "turn.completed":
      applyCodexTurnCompleted(draft, event);
      return;
    case "turn.failed":
      draft.touch();
      return;

    default: {
      // Unknown event types (provider additions) still materialize the
      // conversation, as before; nothing else changes.
      const unhandled: never = event;
      draft.touch();
      return unhandled;
    }
  }
}

/**
 * Terminal / must-show-now events bypass the frame coalescer so completion and
 * the `isStreaming` flip feel immediate. Missing one is non-fatal:
 * `agent-done` / `agent-error` flush as a backstop.
 */
export function isImmediateFlushEvent(event: AgentStreamEvent): boolean {
  if (!isRecord(event)) return false;
  if (isMulticaStreamEvent(event)) {
    const inner = getMulticaInnerType(event);
    return inner === "chat:done" || inner === "task:completed" || inner === "task:cancelled" || inner === "task:failed" || inner === "error";
  }
  switch (event.type) {
    case "result":
    case "turn.completed":
    case "error":
    case "step_finish":
      return true;
    case "event_msg":
      return event.payload?.type === "task_complete";
    default:
      return false;
  }
}
