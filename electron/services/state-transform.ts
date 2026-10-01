/**
 * Pure transforms for persisted app state (no fs, no Electron):
 * archived tool-payload truncation, legacy ⇄ v2 split/assembly, transcript
 * file naming and boundary guards.
 */

import {
  ARCHIVED_TOOL_PAYLOAD_LIMIT,
  STATE_STORE_VERSION,
  type ConversationMeta,
  type PersistedAppIndex,
  type PersistedAppState,
  type PersistedConversationFile,
} from "@shared/state/types";
import type { ChatMessage, Conversation, MessagePart, ToolPart } from "@shared/chat/types";

export type ArchivedMessages = Conversation["archivedMessages"];

export interface ConversationTranscript {
  id: string;
  archivedMessages: ArchivedMessages;
}

const TRUNCATION_MARKER = /…\[truncated \d+ bytes\]$/;
const MAX_TRUNCATION_DEPTH = 8;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/**
 * Cuts `text` to `limit` UTF-16 units plus a `…[truncated N bytes]` marker
 * (N = UTF-8 bytes dropped). Idempotent: an already-truncated string is kept.
 */
export function truncateString(text: string, limit = ARCHIVED_TOOL_PAYLOAD_LIMIT): string {
  if (text.length <= limit) return text;
  const marker = TRUNCATION_MARKER.exec(text);
  if (marker && marker.index <= limit) return text;
  let cut = limit;
  const lastCode = text.charCodeAt(cut - 1);
  if (lastCode >= 0xd800 && lastCode <= 0xdbff) cut -= 1; // don't split a surrogate pair
  const dropped = text.slice(cut);
  return `${text.slice(0, cut)}…[truncated ${utf8ByteLength(dropped)} bytes]`;
}

/**
 * Truncates every string leaf longer than `limit` inside `value`
 * (copy-on-write: unchanged subtrees keep their identity).
 */
export function truncatePayload(value: unknown, limit = ARCHIVED_TOOL_PAYLOAD_LIMIT, depth = 0): unknown {
  if (typeof value === "string") return truncateString(value, limit);
  if (depth >= MAX_TRUNCATION_DEPTH || typeof value !== "object" || value === null) return value;

  if (Array.isArray(value)) {
    let next: unknown[] | null = null;
    value.forEach((item: unknown, i) => {
      const truncated = truncatePayload(item, limit, depth + 1);
      if (truncated !== item) {
        next ??= value.slice() as unknown[];
        next[i] = truncated;
      }
    });
    return next ?? value;
  }

  if (!isRecord(value)) return value;
  let next: Record<string, unknown> | null = null;
  for (const [key, item] of Object.entries(value)) {
    const truncated = truncatePayload(item, limit, depth + 1);
    if (truncated !== item) {
      next ??= { ...value };
      next[key] = truncated;
    }
  }
  return next ?? value;
}

function truncateToolPart(part: ToolPart, limit: number): ToolPart {
  const result = truncatePayload(part.result, limit);
  const rawArgs = truncatePayload(part.args, limit);
  const args = isRecord(rawArgs) ? rawArgs : part.args;
  if (result === part.result && args === part.args) return part;
  return { ...part, result, args };
}

function truncateParts<T extends MessagePart>(parts: T[], limit: number): T[] {
  let next: T[] | null = null;
  parts.forEach((part, i) => {
    if (part.type !== "tool") return;
    const truncated = truncateToolPart(part, limit);
    if (truncated !== part) {
      next ??= parts.slice();
      next[i] = truncated as T;
    }
  });
  return next ?? parts;
}

function truncateMessage(message: ChatMessage, limit: number): ChatMessage {
  if (message.role !== "assistant") return message;
  const parts = Array.isArray(message.parts) ? truncateParts(message.parts, limit) : message.parts;
  const toolCalls = Array.isArray(message.toolCalls) ? truncateParts(message.toolCalls, limit) : message.toolCalls;
  if (parts === message.parts && toolCalls === message.toolCalls) return message;
  return { ...message, parts, toolCalls };
}

/** Caps archived tool `result` / `args` strings (PERF.md hotspot #1). */
export function truncateArchivedMessages(messages: ArchivedMessages, limit = ARCHIVED_TOOL_PAYLOAD_LIMIT): ArchivedMessages {
  if (!Array.isArray(messages)) return [];
  let next: ChatMessage[] | null = null;
  messages.forEach((message, i) => {
    if (typeof message !== "object" || message === null) return;
    const truncated = truncateMessage(message, limit);
    if (truncated !== message) {
      next ??= messages.slice();
      next[i] = truncated;
    }
  });
  return next ?? messages;
}

/** Applies `truncateArchivedMessages` to every conversation of a legacy state. */
export function truncateLegacyState(state: PersistedAppState): PersistedAppState {
  if (!Array.isArray(state.convos)) return state;
  let changed = false;
  const convos = state.convos.map((convo) => {
    if (!isRecord(convo) || !Array.isArray(convo.archivedMessages)) return convo;
    const archivedMessages = truncateArchivedMessages(convo.archivedMessages);
    if (archivedMessages === convo.archivedMessages) return convo;
    changed = true;
    return { ...convo, archivedMessages };
  });
  return changed ? { ...state, convos } : state;
}

/**
 * File name for a conversation transcript. Ids are URI-encoded so they can
 * never escape the conversations directory; leading dots are escaped too.
 */
export function conversationFileName(conversationId: string): string {
  const encoded = encodeURIComponent(conversationId).replace(/^\.+/, (dots) => "%2E".repeat(dots.length));
  return `${encoded}.json`;
}

export function toConversationMeta(convo: Conversation | ConversationMeta): ConversationMeta {
  if (!("archivedMessages" in convo)) return convo;
  const { archivedMessages: _archived, ...meta } = convo;
  return meta;
}

/** Normalizes an index from the renderer: version stamp, no transcripts. */
export function sanitizeIndex(index: PersistedAppIndex): PersistedAppIndex {
  const convos = Array.isArray(index.convos) ? index.convos.filter(isRecord).map(toConversationMeta) : [];
  return { ...index, version: STATE_STORE_VERSION, convos };
}

export function emptyIndex(): PersistedAppIndex {
  return { version: STATE_STORE_VERSION, convos: [] };
}

/** Splits a legacy whole-state object into the v2 index + per-conversation transcripts. */
export function splitLegacyState(state: PersistedAppState): {
  index: PersistedAppIndex;
  transcripts: ConversationTranscript[];
} {
  const convos = Array.isArray(state.convos) ? state.convos.filter(isRecord) : [];
  const transcripts: ConversationTranscript[] = [];
  for (const convo of convos) {
    if (typeof convo.id !== "string" || !convo.id) continue;
    transcripts.push({
      id: convo.id,
      archivedMessages: Array.isArray(convo.archivedMessages) ? convo.archivedMessages : [],
    });
  }
  const { convos: _convos, ...settings } = state;
  return {
    index: { ...settings, version: STATE_STORE_VERSION, convos: convos.map(toConversationMeta) },
    transcripts,
  };
}

/** Rebuilds a legacy whole-state object from the v2 index and loaded transcripts. */
export function assembleLegacyState(
  index: PersistedAppIndex,
  transcripts: ReadonlyMap<string, ArchivedMessages>,
): PersistedAppState {
  const { version: _version, convos, ...settings } = index;
  return {
    ...settings,
    convos: convos.map((meta) => ({ ...meta, archivedMessages: transcripts.get(meta.id) ?? [] })),
  };
}

/** Settings-only view (no conversations / queue) for windows that only read preferences. */
export function settingsOnly(state: PersistedAppState | PersistedAppIndex): PersistedAppState {
  const { convos: _convos, queuedMessages: _queued, ...settings } = state;
  if ("version" in settings) {
    const { version: _version, ...rest } = settings;
    return rest;
  }
  return settings;
}

export function buildConversationFile(id: string, archivedMessages: ArchivedMessages): PersistedConversationFile {
  return { version: STATE_STORE_VERSION, id, archivedMessages };
}

// ── Guards ──────────────────────────────────────────────────────────────────

export function isPersistedAppIndex(value: unknown): value is PersistedAppIndex {
  return isRecord(value) && value.version === STATE_STORE_VERSION && Array.isArray(value.convos);
}

export function isPersistedConversationFile(value: unknown): value is PersistedConversationFile {
  return isRecord(value) && typeof value.id === "string" && Array.isArray(value.archivedMessages);
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export interface ParsedSaveRequest {
  upserts: ConversationTranscript[];
  deletes: string[];
}

/** Validated transcript upserts / deletes of an untrusted `state:save` payload. */
export function parseSaveRequest(request: unknown): ParsedSaveRequest {
  const transcripts = isRecord(request) ? request.transcripts : undefined;
  if (!isRecord(transcripts)) return { upserts: [], deletes: [] };
  const rawUpserts: unknown[] = Array.isArray(transcripts.upserts) ? (transcripts.upserts as unknown[]) : [];
  const rawDeletes: unknown[] = Array.isArray(transcripts.deletes) ? (transcripts.deletes as unknown[]) : [];
  const upserts = rawUpserts.flatMap((upsert): ConversationTranscript[] => {
    if (!isRecord(upsert) || typeof upsert.id !== "string" || !upsert.id) return [];
    const messages = Array.isArray(upsert.archivedMessages) ? (upsert.archivedMessages as ArchivedMessages) : [];
    return [{ id: upsert.id, archivedMessages: messages }];
  });
  const deletes = rawDeletes.filter((id): id is string => typeof id === "string" && id.length > 0);
  return { upserts, deletes };
}
