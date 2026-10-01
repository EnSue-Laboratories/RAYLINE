/** Pure helpers for messages queued while a conversation is busy. */

import type { Attachment, QueuedMessage } from "@shared/chat/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function makeEphemeralId(prefix = "id"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function optionalString<K extends string>(record: Record<string, unknown>, key: K): Partial<Record<K, string>> {
  const value = record[key];
  return typeof value === "string" ? ({ [key]: value } as Partial<Record<K, string>>) : {};
}

export function normalizeQueuedAttachment(attachment: unknown): Attachment | null {
  if (!isRecord(attachment)) return null;
  if (attachment.type === "image" && typeof attachment.dataUrl === "string") {
    return {
      type: "image",
      dataUrl: attachment.dataUrl,
      ...optionalString(attachment, "name"),
      ...optionalString(attachment, "path"),
      ...optionalString(attachment, "storagePath"),
      ...optionalString(attachment, "mime"),
    };
  }
  if (attachment.type === "file" && (typeof attachment.path === "string" || typeof attachment.name === "string")) {
    return {
      type: "file",
      ...optionalString(attachment, "name"),
      ...optionalString(attachment, "path"),
    };
  }
  return null;
}

/** Validate a queued message (persisted or freshly enqueued); null when unusable. */
export function normalizeQueuedMessage(entry: unknown): QueuedMessage | null {
  if (!isRecord(entry) || typeof entry.conversationId !== "string" || typeof entry.text !== "string") return null;
  const attachments = Array.isArray(entry.attachments)
    ? entry.attachments.map(normalizeQueuedAttachment).filter((a): a is Attachment => a !== null)
    : [];
  const queuedAt = entry.queuedAt;
  return {
    id: typeof entry.id === "string" && entry.id ? entry.id : makeEphemeralId("queue"),
    conversationId: entry.conversationId,
    text: entry.text,
    ...(attachments.length > 0 ? { attachments } : {}),
    queuedAt: typeof queuedAt === "number" && Number.isFinite(queuedAt) ? queuedAt : Date.now(),
  };
}

/**
 * True for stream events after which a queued message may interrupt the run
 * (a tool finished or the turn completed), across Claude / Codex event shapes.
 */
export function isQueuedMessageReleaseBoundary(event: unknown): boolean {
  if (!isRecord(event)) return false;
  const message = isRecord(event.message) ? event.message : null;
  if (
    event.type === "user" &&
    Array.isArray(message?.content) &&
    message.content.some((block) => isRecord(block) && block.type === "tool_result")
  ) {
    return true;
  }
  if (event.type === "result" || event.type === "turn.completed") return true;
  const item = isRecord(event.item) ? event.item : null;
  if (event.type === "item.completed" && item?.type === "command_execution") return true;
  const payload = isRecord(event.payload) ? event.payload : null;
  if (
    event.type === "response_item" &&
    (payload?.type === "function_call_output" || payload?.type === "custom_tool_call_output")
  ) {
    return true;
  }
  return event.type === "event_msg" && payload?.type === "task_complete";
}
