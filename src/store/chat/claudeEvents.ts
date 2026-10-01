/**
 * Claude Code stream-json events (`stream_event`, `assistant`, `user`,
 * `result`, `system`) applied to a conversation draft.
 */
import type {
  ClaudeAssistantEvent,
  ClaudeContentBlock,
  ClaudeContentBlockDeltaEvent,
  ClaudeContentBlockStartEvent,
  ClaudeResultEvent,
  ClaudeStreamEventEnvelope,
  ClaudeSystemEvent,
  ClaudeUserEvent,
} from "@shared/agent/events";
import type { MessagePart, ToolPart } from "@shared/chat/types";
import {
  asToolPart,
  buildImagePartFromAnthropicBlock,
  cloneStreamState,
  editLastAssistant,
  editTrailingAssistant,
  errorTextPart,
  finalizeAssistant,
  findPartIndexByStreamKey,
  findToolPartIndex,
  isRecord,
} from "./assistant";
import type { ConversationDraft } from "./draft";
import { uid } from "./ids";
import { claudeUsageToTokenUsage, mergeUsage } from "./usage";

const HOOK_STOPPED_TEXT =
  "Claude stopped after a tool hook returned continue: false. This is expected — send another message when you want to continue.";

function buildBlockKey(turn: number, blockIndex: number): string {
  return `${turn}:${blockIndex}`;
}

/**
 * Tool input arrives as partial JSON. Only attempt a parse when the buffer can
 * be a complete object (ends with `}`), which turns the O(n²) parse-per-delta
 * into roughly one parse per closing brace.
 */
function parseToolArgs(json: string): Record<string, unknown> | null {
  if (!json.trimEnd().endsWith("}")) return null;
  try {
    const parsed: unknown = JSON.parse(json);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function applyContentBlockStart(draft: ConversationDraft, inner: ClaudeContentBlockStartEvent): void {
  const message = editLastAssistant(draft);
  const streamState = cloneStreamState(message._streamState);
  const blockIndex = inner.index;
  // Forwarded verbatim from the CLI; tolerate a missing block like before.
  const block: ClaudeContentBlock | undefined = inner.content_block;

  if (streamState.seenIndexes[blockIndex]) {
    streamState.currentTurn += 1;
    streamState.seenIndexes = {};
    streamState.activeBlocks = {};
    streamState.activeThinking = {};
  }
  streamState.seenIndexes[blockIndex] = true;
  const streamKey = buildBlockKey(streamState.currentTurn, blockIndex);
  streamState.activeBlocks[blockIndex] = streamKey;

  let part: MessagePart | null = null;
  switch (block?.type) {
    case "thinking":
      part = { type: "thinking", text: "", blockIndex, _streamKey: streamKey };
      streamState.activeThinking[streamKey] = true;
      message.isThinking = true;
      break;
    case "tool_use":
      part = {
        type: "tool",
        id: block.id || `tc${uid()}`,
        name: block.name || "unknown",
        args: {},
        argsJson: "",
        result: null,
        status: "running",
        blockIndex,
        _streamKey: streamKey,
      };
      break;
    case "text":
      part = { type: "text", text: "", blockIndex, _streamKey: streamKey };
      break;
    case "image": {
      // Vision-output blocks arrive whole (no per-delta image bytes).
      const imagePart = buildImagePartFromAnthropicBlock(block);
      if (imagePart) part = { ...imagePart, blockIndex, _streamKey: streamKey };
      break;
    }
    default:
      // Unknown block types (redacted_thinking, …) leave the message untouched.
      break;
  }
  if (!part) return;
  draft.editParts(message).push(draft.own(part));
  message.isStreaming = true;
  message._streamState = draft.own(streamState);
}

function applyContentBlockDelta(draft: ConversationDraft, inner: ClaudeContentBlockDeltaEvent): void {
  const message = editLastAssistant(draft);
  const streamKey = message._streamState?.activeBlocks[inner.index];
  const parts = message.parts ?? [];
  const delta = inner.delta;
  switch (delta.type) {
    case "text_delta": {
      const index = findPartIndexByStreamKey(parts, streamKey, "text");
      const part = index >= 0 ? draft.editPart(message, index) : undefined;
      if (part?.type === "text") part.text += delta.text || "";
      message.isStreaming = true;
      return;
    }
    case "input_json_delta": {
      const index = findPartIndexByStreamKey(parts, streamKey, "tool");
      const part = asToolPart(index >= 0 ? draft.editPart(message, index) : undefined);
      if (part) {
        part.argsJson = (part.argsJson || "") + (delta.partial_json || "");
        const args = parseToolArgs(part.argsJson);
        if (args) part.args = args;
      }
      message.isStreaming = true;
      return;
    }
    case "thinking_delta": {
      const index = findPartIndexByStreamKey(parts, streamKey, "thinking");
      const part = index >= 0 ? draft.editPart(message, index) : undefined;
      if (part?.type === "thinking") part.text += delta.thinking || "";
      message.isStreaming = true;
      message.isThinking = true;
      return;
    }
    case "signature_delta":
      return;
    default: {
      const unhandled: never = delta;
      return unhandled;
    }
  }
}

export function applyClaudeStreamEnvelope(draft: ConversationDraft, event: ClaudeStreamEventEnvelope): void {
  const inner = event.event;
  draft.touch();
  // Raw stream events are forwarded verbatim; guard against an empty envelope.
  if (!isRecord(inner)) return;

  // Context-window fullness tracks the LATEST API call's usage, not the turn
  // aggregate: `message_start` overwrites, `message_delta` merges, and the
  // turn-level `result` usage is ignored.
  switch (inner.type) {
    case "message_start":
      if (inner.message?.usage) editLastAssistant(draft)._usage = claudeUsageToTokenUsage(inner.message.usage);
      return;
    case "message_delta":
      if (inner.usage) {
        const message = editLastAssistant(draft);
        message._usage = mergeUsage(message._usage, claudeUsageToTokenUsage(inner.usage));
      }
      return;
    case "content_block_start":
      applyContentBlockStart(draft, inner);
      return;
    case "content_block_delta":
      applyContentBlockDelta(draft, inner);
      return;
    case "content_block_stop": {
      const message = editLastAssistant(draft);
      const streamState = draft.editStreamState(message);
      const stoppedKey = streamState.activeBlocks[inner.index];
      delete streamState.activeBlocks[inner.index];
      if (stoppedKey && streamState.activeThinking[stoppedKey]) delete streamState.activeThinking[stoppedKey];
      message.isThinking = Object.keys(streamState.activeThinking).length > 0;
      return;
    }
    case "message_stop":
    case "ping":
    case "error":
      return;
    default: {
      const unhandled: never = inner;
      return unhandled;
    }
  }
}

/**
 * With --include-partial-messages, `assistant` events carry the full text.
 * Only used as a fallback when no stream parts exist yet. Its usage is
 * per-call and ignored (`result` / `message_delta` own usage).
 */
export function applyClaudeAssistant(draft: ConversationDraft, event: ClaudeAssistantEvent): void {
  draft.touch();
  const message = editLastAssistant(draft);
  const content = event.message?.content;
  if ((message.parts?.length ?? 0) > 0 || !Array.isArray(content)) return;
  const parts = draft.editParts(message);
  for (const block of content) {
    if (block.type === "text" && block.text) parts.push(draft.own({ type: "text", text: block.text }));
    if (block.type === "tool_use" && findToolPartIndex(parts, block.id) < 0) {
      const tool: ToolPart = { type: "tool", id: block.id, name: block.name || "unknown", args: block.input || {}, result: null, status: "running" };
      parts.push(draft.own(tool));
    }
    if (block.type === "image") {
      const imagePart = buildImagePartFromAnthropicBlock(block);
      if (imagePart) parts.push(draft.own(imagePart));
    }
  }
  message.isThinking = false;
}

export function applyClaudeUser(draft: ConversationDraft, event: ClaudeUserEvent): void {
  draft.touch();
  const content = event.message?.content;
  // Capture the Claude-assigned uuid on the latest user message (rewind / edit).
  if (event.uuid) {
    draft.log("User event UUID:", {
      uuid: event.uuid,
      hasToolResult: Array.isArray(content) && content.some((block) => block.type === "tool_result"),
    });
    const messages = draft.messages;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const message = messages[i];
      if (message?.role === "user" && !message.claudeUuid) {
        const edited = draft.editUser(i);
        if (edited) edited.claudeUuid = event.uuid;
        break;
      }
    }
  }
  if (!Array.isArray(content)) return;
  for (const block of content) {
    if (block.type !== "tool_result" || !block.tool_use_id) continue;
    const messages = draft.messages;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const candidate = messages[i];
      if (candidate?.role !== "assistant" || !candidate.parts) continue;
      const partIndex = findToolPartIndex(candidate.parts, block.tool_use_id);
      if (partIndex < 0) continue;
      const message = draft.editAssistant(i);
      const part = message ? asToolPart(draft.editPart(message, partIndex)) : undefined;
      if (part) {
        part.result = block.content;
        part.status = "done";
      }
      break;
    }
  }
}

export function applyClaudeResult(draft: ConversationDraft, event: ClaudeResultEvent): void {
  const message = editTrailingAssistant(draft);
  if (message) {
    // `event.usage` is aggregated across the turn — right for cost, wrong for
    // window fullness — so `_usage` is left alone.
    if (event.is_error || event.subtype === "error_during_execution") {
      const errorText = event.result || event.error || (event.errors && event.errors.length > 0 ? event.errors.join("\n") : null) || "An error occurred.";
      draft.editParts(message).push(draft.own(errorTextPart(errorText)));
    } else if (event.terminal_reason === "hook_stopped") {
      const parts = draft.editParts(message);
      if (!parts.some((part) => part.type === "status" && part.kind === "paused")) {
        parts.push(draft.own({ type: "status", kind: "paused", title: "Paused by hook", text: HOOK_STOPPED_TEXT }));
      }
    }
    finalizeAssistant(message);
  }
  draft.set("isStreaming", false);
}

/** `system` / `compact_boundary` → transient "compacting…" flag (stripped at stream end). */
export function applyClaudeSystem(draft: ConversationDraft, event: ClaudeSystemEvent): void {
  draft.touch();
  if (event.subtype !== "compact_boundary") return;
  editLastAssistant(draft)._compacting = true;
}
