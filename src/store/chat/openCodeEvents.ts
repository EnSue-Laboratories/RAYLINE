/** OpenCode JSONL / serve events (and the shared `error` event) applied to a draft. */
import type { CodexStreamErrorEvent } from "@shared/agent/codex-stream";
import type { OpenCodeCliEvent } from "@shared/agent/events";
import type { AssistantMessage, MessagePart } from "@shared/chat/types";
import { editLastAssistant, ensureAssistantIndex, errorTextPart, finalizeAssistant } from "./assistant";
import type { ConversationDraft } from "./draft";
import {
  buildOpenCodeThinkingPart,
  extractOpenCodeError,
  extractOpenCodeSessionId,
  extractOpenCodeTool,
  sortOpenCodeParts,
  splitOpenCodeTextAndThinkingParts,
} from "./openCodeParse";
import { normalizeOpenCodeUsage } from "./usage";

const STEP_DONE_RE = /^(stop|done|complete|completed|end_turn)$/i;

/** Insert or merge `next` (matched by type + id), then re-sort by start time. */
function upsertOpenCodePart(draft: ConversationDraft, message: AssistantMessage, next: MessagePart & { id?: string }): void {
  const parts = draft.editParts(message);
  const index = parts.findIndex((part) => part.type === next.type && "id" in part && part.id === next.id);
  const existing = index >= 0 ? draft.editPart(message, index) : undefined;
  if (existing) Object.assign(existing, next);
  else parts.push(draft.own(next));
  sortOpenCodeParts(parts);
}

export function applyOpenCodeEvent(draft: ConversationDraft, event: OpenCodeCliEvent | CodexStreamErrorEvent): void {
  draft.touch();
  const sessionId = extractOpenCodeSessionId(event);
  if (sessionId) {
    draft.set("_opencodeSessionId", sessionId);
    draft.log("Captured OpenCode session ID:", { conversationId: draft.id, sessionId, eventType: event.type });
  }

  switch (event.type) {
    case "step_start":
      ensureAssistantIndex(draft);
      return;
    case "tool_use": {
      const message = editLastAssistant(draft);
      upsertOpenCodePart(draft, message, extractOpenCodeTool(event));
      message.isStreaming = true;
      return;
    }
    case "reasoning": {
      const thinking = buildOpenCodeThinkingPart(event);
      if (!thinking) return;
      const message = editLastAssistant(draft);
      upsertOpenCodePart(draft, message, thinking);
      message.isStreaming = true;
      message.isThinking = !Number.isFinite(thinking.durationMs);
      return;
    }
    case "text":
    case "opencode_stdout": {
      const pieces = splitOpenCodeTextAndThinkingParts(event);
      if (pieces.length === 0) return;
      const message = editLastAssistant(draft);
      for (const piece of pieces) upsertOpenCodePart(draft, message, piece);
      message.isStreaming = true;
      message.isThinking = false;
      return;
    }
    case "error": {
      const message = editLastAssistant(draft);
      draft.editParts(message).push(draft.own(errorTextPart(extractOpenCodeError(event))));
      finalizeAssistant(message);
      draft.set("isStreaming", false);
      return;
    }
    case "step_finish": {
      const message = editLastAssistant(draft);
      const usage = normalizeOpenCodeUsage(event.part, message._usage);
      if (usage) message._usage = usage;
      const reason = event.reason || event.part?.reason || event.status || "";
      if (STEP_DONE_RE.test(reason)) {
        finalizeAssistant(message);
        draft.set("isStreaming", false);
      }
      return;
    }
    default: {
      const unhandled: never = event;
      return unhandled;
    }
  }
}
