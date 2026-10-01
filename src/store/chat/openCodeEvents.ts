/** OpenCode JSONL / serve events (and the shared `error` event) applied to a draft. */
import type { CodexStreamErrorEvent } from "@shared/agent/codex-stream";
import type { OpenCodeCliEvent, OpenCodeShapedProviderId } from "@shared/agent/events";
import type { AssistantMessage, MessagePart } from "@shared/chat/types";
import { appendAdjacentText, buildErrorPart, editLastAssistant, ensureAssistantIndex, finalizeAssistant } from "./assistant";
import type { ConversationDraft } from "./draft";
import {
  buildOpenCodeThinkingPart,
  extractOpenCodeError,
  extractOpenCodeReasoningText,
  extractOpenCodeText,
  extractOpenCodeSessionId,
  extractOpenCodeTool,
  sortOpenCodeParts,
  splitOpenCodeTextAndThinkingParts,
} from "./openCodeParse";
import { normalizeOpenCodeUsage } from "./usage";

const STEP_DONE_RE = /^(stop|done|complete|completed|end_turn)$/i;

/**
 * Insert or merge `next` (matched by type + id), then re-sort by start time.
 * Grok / AGY parts are kept in arrival order: their merged text deltas carry
 * no start time, so sorting would hoist every tool call above them.
 */
function upsertOpenCodePart(draft: ConversationDraft, message: AssistantMessage, next: MessagePart & { id?: string }, sort = true): void {
  const parts = draft.editParts(message);
  const index = parts.findIndex((part) => part.type === next.type && "id" in part && part.id === next.id);
  const existing = index >= 0 ? draft.editPart(message, index) : undefined;
  if (existing) Object.assign(existing, next);
  else parts.push(draft.own(next));
  if (sort) sortOpenCodeParts(parts);
}

type OpenCodeShapedEvent = OpenCodeCliEvent | CodexStreamErrorEvent;

/** Grok / AGY adapters tag their OpenCode-shaped events; native OpenCode (and Codex `error`) don't. */
function shapedProvider(event: OpenCodeShapedEvent): OpenCodeShapedProviderId | undefined {
  return "provider" in event ? event.provider : undefined;
}

const SESSION_KEYS = { grok: "_grokSessionId", agy: "_agySessionId" } as const;
const PROVIDER_LABELS = { grok: "Grok", agy: "Antigravity" } as const;

export function applyOpenCodeEvent(draft: ConversationDraft, event: OpenCodeShapedEvent): void {
  draft.touch();
  const provider = shapedProvider(event);
  const label = provider ? PROVIDER_LABELS[provider] : "OpenCode";
  const sessionId = extractOpenCodeSessionId(event);
  if (sessionId) {
    draft.set(provider ? SESSION_KEYS[provider] : "_opencodeSessionId", sessionId);
    draft.log(`Captured ${label} session ID:`, { conversationId: draft.id, sessionId, eventType: event.type });
  }

  switch (event.type) {
    case "step_start":
      ensureAssistantIndex(draft);
      return;
    case "tool_use": {
      const message = editLastAssistant(draft);
      upsertOpenCodePart(draft, message, extractOpenCodeTool(event), !provider);
      message.isStreaming = true;
      return;
    }
    case "reasoning": {
      if (provider) {
        // Grok / AGY stream reasoning deltas: merge into readable paragraphs.
        const text = extractOpenCodeReasoningText(event);
        if (!text) return;
        const message = editLastAssistant(draft);
        appendAdjacentText(draft, message, "thinking", text);
        message.isStreaming = true;
        message.isThinking = true;
        return;
      }
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
      if (provider) {
        const text = extractOpenCodeText(event);
        if (!text) return;
        const message = editLastAssistant(draft);
        appendAdjacentText(draft, message, "text", text);
        message.isStreaming = true;
        message.isThinking = false;
        return;
      }
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
      draft.editParts(message).push(draft.own(buildErrorPart(extractOpenCodeError(event), `${label} error`)));
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
