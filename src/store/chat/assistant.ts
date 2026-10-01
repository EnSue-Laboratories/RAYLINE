import type { ClaudeContentBlock, CodexResponseContentItem } from "@shared/agent/events";
import type { AssistantMessage, ChatMessage, ErrorPart, ImagePart, MessagePart, StreamState, ToolPart } from "@shared/chat/types";
import { type ConversationDraft, createStreamState } from "./draft";
import { uid } from "./ids";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** First non-empty string among `values`, else "". */
export function pickString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) return value;
  }
  return "";
}

export function findLatestAssistantIndex(messages: readonly ChatMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "assistant") return i;
  }
  return -1;
}

export function newAssistantMessage(withStreamState: boolean): AssistantMessage {
  return {
    id: uid(),
    role: "assistant",
    parts: [],
    isStreaming: true,
    isThinking: false,
    ...(withStreamState ? { _streamState: createStreamState() } : {}),
    _startedAt: Date.now(),
    _usage: null,
  };
}

/**
 * Make sure the conversation ends with an assistant message (creating one, or
 * stamping `_startedAt` on an existing one) and return its index. Does not copy
 * the message when it is already in shape.
 */
export function ensureAssistantIndex(draft: ConversationDraft): number {
  const messages = draft.messages;
  const lastIndex = messages.length - 1;
  const last = messages[lastIndex];
  if (!last || last.role !== "assistant") {
    draft.pushMessage(newAssistantMessage(true));
    return draft.messages.length - 1;
  }
  if (!last._startedAt) {
    const edited = draft.editAssistant(lastIndex);
    if (edited) edited._startedAt = Date.now();
  }
  return lastIndex;
}

/** `ensureAssistantIndex` + an owned, editable copy of that message. */
export function editLastAssistant(draft: ConversationDraft): AssistantMessage {
  const index = ensureAssistantIndex(draft);
  const message = draft.editAssistant(index);
  if (!message) throw new Error("ensureAssistantIndex must leave an assistant message last");
  return message;
}

/** Owned copy of the last message when it is an assistant message (never creates one). */
export function editTrailingAssistant(draft: ConversationDraft): AssistantMessage | undefined {
  return draft.editAssistant(draft.messages.length - 1);
}

/**
 * Freeze the final elapsed duration once the turn ends (persisted, so the
 * loading footer survives reloads) and drop the transient `_compacting` flag.
 * Mutates an owned message.
 */
export function freezeElapsed(message: AssistantMessage): void {
  delete message._compacting;
  if (message._elapsedMs != null) return;
  if (!message._startedAt) return;
  message._elapsedMs = Date.now() - message._startedAt;
}

export function finalizeAssistant(message: AssistantMessage): void {
  message.isStreaming = false;
  message.isThinking = false;
  freezeElapsed(message);
}

/** Pure variant for whole-conversation finalization (done / cancel). */
export function finalizedCopy(message: ChatMessage): ChatMessage {
  if (message.role !== "assistant") return message;
  const copy: AssistantMessage = { ...message, isStreaming: false, isThinking: false };
  freezeElapsed(copy);
  return copy;
}

/** Collapsible error part; the summary is the first non-empty line (PR #230). */
export function buildErrorPart(error: string, title = "Error"): ErrorPart {
  const text = error || "An error occurred.";
  const summary = text.split("\n").map((line) => line.trim()).find(Boolean) || title;
  return { type: "error", title, summary, text };
}

export function partStreamKey(part: MessagePart): string | undefined {
  return part.type === "status" || part.type === "error" ? undefined : part._streamKey;
}

/**
 * Delta streams (Grok / AGY) may split words across events: append to the
 * last part when it has the same kind, otherwise start a new part. A tool or
 * reasoning boundary is never crossed. Mutates the owned message (PR #230).
 */
export function appendAdjacentText(draft: ConversationDraft, message: AssistantMessage, type: "text" | "thinking", text: string): void {
  if (!text) return;
  const parts = message.parts ?? [];
  const lastIndex = parts.length - 1;
  if (parts[lastIndex]?.type === type) {
    const last = draft.editPart(message, lastIndex);
    if (last && (last.type === "text" || last.type === "thinking")) {
      last.text += text;
      return;
    }
  }
  draft.editParts(message).push(draft.own({ type, text }));
}

/** Index of the part with `streamKey` and `type`; searched from the end (active blocks are recent). */
export function findPartIndexByStreamKey(parts: readonly MessagePart[], streamKey: string | undefined, type: MessagePart["type"]): number {
  if (!streamKey) return -1;
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const part = parts[i];
    if (part && part.type === type && partStreamKey(part) === streamKey) return i;
  }
  return -1;
}

export function findToolPartIndex(parts: readonly MessagePart[], toolId: string | undefined): number {
  if (toolId === undefined) return -1;
  return parts.findIndex((part) => part.type === "tool" && part.id === toolId);
}

export function cloneStreamState(state: StreamState | undefined): StreamState {
  return {
    currentTurn: state?.currentTurn ?? 0,
    seenIndexes: { ...state?.seenIndexes },
    activeBlocks: { ...state?.activeBlocks },
    activeThinking: { ...state?.activeThinking },
  };
}

export function asToolPart(part: MessagePart | undefined): ToolPart | undefined {
  return part?.type === "tool" ? part : undefined;
}

// ── Image content blocks ────────────────────────────────────────────────────

/** Anthropic `{ type: "image", source: base64 | url }` → ImagePart. */
export function buildImagePartFromAnthropicBlock(block: ClaudeContentBlock | undefined): ImagePart | null {
  if (!block || block.type !== "image") return null;
  const source: unknown = block.source;
  if (!isRecord(source)) return null;
  const id = block.id || `img${uid()}`;
  const alt = block.alt || "";
  if (source.type === "base64" && typeof source.data === "string" && source.data) {
    const mime = pickString(source.media_type, source.mediaType) || "image/png";
    return { type: "image", id, src: `data:${mime};base64,${source.data}`, mime, alt };
  }
  if (source.type === "url" && typeof source.url === "string" && source.url) {
    return { type: "image", id, src: source.url, alt };
  }
  return null;
}

/** OpenAI `image_url` / `output_image` content item → ImagePart. */
export function buildImagePartFromOpenAIBlock(item: CodexResponseContentItem | undefined): ImagePart | null {
  if (!item) return null;
  if (item.type !== "image_url" && item.type !== "output_image") return null;
  const raw = item.image_url;
  const url = typeof raw === "string" ? raw : raw?.url;
  if (!url) return null;
  const record: Record<string, unknown> = { ...item };
  return { type: "image", id: `img${uid()}`, src: url, alt: pickString(record.alt) };
}
