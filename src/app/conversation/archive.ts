/**
 * Pure helpers for persisted transcripts (`conversation.archivedMessages`):
 * serialization, sanitization of injected prompt metadata, previews, and
 * merging transcripts loaded from CLI session files / Multica.
 */

import {
  STORED_MESSAGE_IMAGE_TYPE,
  type ChatMessage,
  type MessageImage,
  type MessagePart,
} from "@shared/chat/types";

const MULTICA_ATTACHMENT_BLOCK = /^\s*<rayline-multica-attachments>[\s\S]*?<\/rayline-multica-attachments>\s*/;
const MULTICA_SETUP_BLOCK = /^\s*<rayline-multica-setup>[\s\S]*?<\/rayline-multica-setup>\s*/;
const REMINDER_BLOCK = /^\s*<system-reminder>[\s\S]*?<\/system-reminder>\s*/;
const PRIME_BLOCK = /^\s*\[(?:Prior conversation context|Prior conversation with a different model)[^\]]*\][\s\S]*?\[End of prior conversation\]\s*(?:---\s*)?/;
const INJECTED_BLOCKS = [MULTICA_ATTACHMENT_BLOCK, MULTICA_SETUP_BLOCK, REMINDER_BLOCK, PRIME_BLOCK];

/** Remove RayLine-injected blocks (multica setup, reminders, primes) from the start of a prompt. */
export function stripInjectedPromptMetadata(text: unknown): string {
  let next = typeof text === "string" ? text : typeof text === "number" || typeof text === "boolean" ? String(text) : "";
  if (!next) return "";
  let changed = true;
  while (changed) {
    changed = false;
    for (const block of INJECTED_BLOCKS) {
      const stripped = next.replace(block, "");
      if (stripped !== next) {
        next = stripped;
        changed = true;
      }
    }
  }
  return next.trim();
}

export function sanitizeArchivedMessage(message: ChatMessage): ChatMessage {
  if (message.role !== "user" || typeof message.text !== "string") return message;
  const sanitizedText = stripInjectedPromptMetadata(message.text);
  return sanitizedText === message.text ? message : { ...message, text: sanitizedText };
}

export function isNonEmptyArchivedMessage(message: ChatMessage | null | undefined): message is ChatMessage {
  if (!message) return false;
  if (message.role !== "user") return true;
  if (typeof message.text !== "string" || message.text.trim().length > 0) return true;
  if (Array.isArray(message.images) && message.images.length > 0) return true;
  if (Array.isArray(message.files) && message.files.length > 0) return true;
  return false;
}

export function conversationHasInjectedPromptMetadata(messages: readonly ChatMessage[] | null | undefined): boolean {
  if (!messages) return false;
  return messages.some((message) => {
    if (message.role !== "user" || typeof message.text !== "string") return false;
    return stripInjectedPromptMetadata(message.text) !== message.text;
  });
}

/** Drop fields that must never be persisted (plan quota snapshot). */
export function stripTransientMessageState(message: ChatMessage): ChatMessage {
  if (message.role !== "assistant" || !("_rateLimits" in message)) return message;
  const { _rateLimits: _ignored, ...next } = message;
  return next;
}

function serializeMessageImageForState(image: MessageImage | null | undefined): MessageImage | null {
  if (typeof image === "string") return image;
  if (!image || typeof image !== "object") return null;
  if ("storagePath" in image && typeof image.storagePath === "string" && image.storagePath) {
    const originalPath = "originalPath" in image && typeof image.originalPath === "string" ? image.originalPath : undefined;
    const livePath = "path" in image && typeof image.path === "string" ? image.path : undefined;
    return {
      type: STORED_MESSAGE_IMAGE_TYPE,
      storagePath: image.storagePath,
      ...(typeof image.mime === "string" ? { mime: image.mime } : {}),
      ...(typeof image.name === "string" ? { name: image.name } : {}),
      ...(originalPath !== undefined ? { originalPath } : {}),
      ...(livePath !== undefined ? { originalPath: livePath } : {}),
    };
  }
  if ("dataUrl" in image && typeof image.dataUrl === "string") return image.dataUrl;
  return null;
}

/** Field-by-field copy of a part (drops stream bookkeeping like `_streamKey`/`argsJson`). */
function serializePart(part: MessagePart): MessagePart {
  const src = part as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = { type: part.type };
  if (src.id) out.id = src.id;
  if (src.name) out.name = src.name;
  if (src.text != null) out.text = src.text;
  if (src.args != null) out.args = src.args;
  if (src.result != null) out.result = src.result;
  if (src.status) out.status = src.status;
  if (src.kind) out.kind = src.kind;
  if (src.title) out.title = src.title;
  if (typeof src.durationMs === "number" && Number.isFinite(src.durationMs)) out.durationMs = src.durationMs;
  // Image-part fields. `src` may be an https URL or a `data:` URL; `storagePath`
  // lets the renderer re-fetch via window.api.readImage on reload.
  if (part.type === "image") {
    for (const key of ["src", "alt", "mime", "storagePath", "originalPath"] as const) {
      if (typeof src[key] === "string") out[key] = src[key];
    }
  }
  return out as unknown as MessagePart;
}

/** Live messages → the persisted transcript shape (no streaming/transient state). */
export function serializeMessagesForState(messages: readonly ChatMessage[] | null | undefined): ChatMessage[] {
  if (!messages) return [];
  return messages.map((message) => {
    const src = message as unknown as Record<string, unknown>;
    const next: Record<string, unknown> = { id: message.id, role: message.role };
    if (typeof src.text === "string") next.text = src.text;
    if (src.mode) next.mode = src.mode;
    if (src.command) next.command = src.command;
    if (src.exitCode != null) next.exitCode = src.exitCode;
    if (message.localOnly) next.localOnly = true;
    if (message.role === "assistant" && Array.isArray(message.parts)) {
      next.parts = message.parts.map(serializePart);
    }
    if (message.role === "user") {
      if (Array.isArray(message.images) && message.images.length > 0) {
        const images: MessageImage[] = [];
        for (const image of message.images) {
          const serialized = serializeMessageImageForState(image);
          if (serialized !== null) images.push(serialized);
        }
        if (images.length > 0) next.images = images;
      }
      if (Array.isArray(message.files) && message.files.length > 0) next.files = message.files;
      if (message.claudeUuid) next.claudeUuid = message.claudeUuid;
    }
    if (message.role === "assistant") {
      if (message._usage) next._usage = message._usage;
      if (message._elapsedMs != null) next._elapsedMs = message._elapsedMs;
    }
    return next as unknown as ChatMessage;
  });
}

function textParts(message: ChatMessage): string[] {
  if (message.role !== "assistant" || !Array.isArray(message.parts)) return [];
  const out: string[] = [];
  for (const part of message.parts) {
    if (part.type === "text" && typeof part.text === "string") out.push(part.text);
  }
  return out;
}

/** Full text of a message (text, or its text parts joined by spaces). */
export function getMessageTextPreview(message: ChatMessage | null | undefined): string {
  if (!message) return "";
  if (typeof message.text === "string") return message.text;
  return textParts(message).join(" ");
}

/** Sidebar preview: first `limit` chars of text parts, without joining the whole message. */
export function getSidebarMessagePreview(message: ChatMessage | null | undefined, limit = 45): string | null {
  if (!message) return null;
  if (typeof message.text === "string") return message.text.slice(0, limit);
  if (message.role !== "assistant" || !Array.isArray(message.parts)) return null;
  let preview = "";
  for (const part of message.parts) {
    if (part.type !== "text" || typeof part.text !== "string" || part.text.length === 0) continue;
    if (preview) preview += " ";
    const remaining = limit - preview.length;
    if (remaining <= 0) break;
    preview += part.text.slice(0, remaining);
    if (preview.length >= limit) break;
  }
  return preview || null;
}

/** Preview text stored in `conversation.lastPreview` (60 chars). */
export function getLastMessagePreview(messages: readonly ChatMessage[]): string {
  const last = messages[messages.length - 1];
  if (!last) return "";
  const text = last.role === "assistant" && Array.isArray(last.parts) ? textParts(last).join(" ") : last.text ?? "";
  return text.slice(0, 60);
}

export function isPersistableLiveMessage(message: ChatMessage | null | undefined): boolean {
  if (!message) return false;
  if (message.role !== "assistant") return true;
  if (typeof message.text === "string" && message.text.trim()) return true;
  return Array.isArray(message.parts) && message.parts.length > 0;
}

function getArchivedMessageText(message: ChatMessage): string {
  if (typeof message.text === "string") return message.text.trim();
  return textParts(message).join("\n").trim();
}

function getArchivedMessageSignature(message: ChatMessage | null | undefined): string {
  if (!message) return "||||0|0|";
  const normalizedText = getArchivedMessageText(message).replace(/\s+/g, " ").slice(0, 400);
  const mode = message.role === "assistant" ? "" : message.mode ?? "";
  const command = message.role === "system" ? message.command ?? "" : "";
  const exitCode = message.role === "system" ? message.exitCode ?? "" : "";
  const images = message.role === "user" && Array.isArray(message.images) ? message.images.length : 0;
  const files = message.role === "user" && Array.isArray(message.files) ? message.files.length : 0;
  return [message.role, mode, command, exitCode, images, files, normalizedText].join("|");
}

/** Append `loaded` after the longest suffix/prefix overlap with `existing`. */
export function mergeArchivedMessages(
  existingMessages: ChatMessage[] | null | undefined,
  loadedMessages: ChatMessage[] | null | undefined,
): ChatMessage[] {
  const existing = existingMessages ?? [];
  const loaded = loadedMessages ?? [];
  if (loaded.length === 0) return existing;
  if (existing.length === 0) return loaded;

  const existingSignatures = existing.map(getArchivedMessageSignature);
  const loadedSignatures = loaded.map(getArchivedMessageSignature);
  const maxOverlap = Math.min(existingSignatures.length, loadedSignatures.length);

  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    let matches = true;
    for (let i = 0; i < overlap; i += 1) {
      if (existingSignatures[existingSignatures.length - overlap + i] !== loadedSignatures[i]) {
        matches = false;
        break;
      }
    }
    if (matches) return [...existing, ...loaded.slice(overlap)];
  }

  return loaded.length > existing.length ? loaded : existing;
}

/** Copy image/file metadata from local user messages onto remote ones (Multica backfill). */
export function hydrateArchivedAttachmentMetadata(
  existingMessages: readonly ChatMessage[],
  loadedMessages: ChatMessage[],
): ChatMessage[] {
  if (existingMessages.length === 0 || loadedMessages.length === 0) return loadedMessages;
  return loadedMessages.map((message, index) => {
    if (message.role !== "user") return message;
    const local = existingMessages[index];
    if (!local || local.role !== "user") return message;

    const remoteText = getArchivedMessageText(message);
    const localText = getArchivedMessageText(local);
    if (remoteText && localText && remoteText !== localText) return message;

    const next = { ...message };
    if ((!Array.isArray(message.images) || message.images.length === 0) && Array.isArray(local.images) && local.images.length > 0) {
      next.images = local.images;
    }
    if ((!Array.isArray(message.files) || message.files.length === 0) && Array.isArray(local.files) && local.files.length > 0) {
      next.files = local.files;
    }
    return next;
  });
}

export function areArchivedMessageListsEqual(a: readonly ChatMessage[], b: readonly ChatMessage[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (getArchivedMessageSignature(a[i]) !== getArchivedMessageSignature(b[i])) return false;
  }
  return true;
}

export function isArchivedMessagePrefix(prefix: readonly ChatMessage[], full: readonly ChatMessage[]): boolean {
  if (prefix.length > full.length) return false;
  for (let i = 0; i < prefix.length; i += 1) {
    if (getArchivedMessageSignature(prefix[i]) !== getArchivedMessageSignature(full[i])) return false;
  }
  return true;
}

/** Undo a bug where a remote backfill was appended repeatedly (N exact copies → one). */
export function collapseRepeatedRemoteBackfill(existing: ChatMessage[], remote: ChatMessage[]): ChatMessage[] {
  if (existing.length === 0 || remote.length === 0) return existing;
  if (existing.length <= remote.length || existing.length % remote.length !== 0) return existing;

  const remoteSignatures = remote.map(getArchivedMessageSignature);
  const repeatCount = existing.length / remote.length;
  if (repeatCount < 2) return existing;

  for (let repeat = 0; repeat < repeatCount; repeat += 1) {
    for (let i = 0; i < remote.length; i += 1) {
      if (getArchivedMessageSignature(existing[repeat * remote.length + i]) !== remoteSignatures[i]) {
        return existing;
      }
    }
  }
  return remote;
}
