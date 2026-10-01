/**
 * Sidebar search text: flatten a session's messages into one string, and a
 * size-bounded cache keyed by file path + mtime + size so unchanged sessions
 * are never re-parsed.
 */

import type { ChatMessage, SessionSearchText } from "@shared/chat/types";

function stringifySearchValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return ""; // BigInt / cycles — impossible for JSON-parsed session data
  }
}

function pushTrimmed(chunks: string[], value: string | undefined): void {
  const trimmed = value?.trim();
  if (trimmed) chunks.push(trimmed);
}

export function messageToSearchText(message: ChatMessage): string {
  const chunks: string[] = [];
  pushTrimmed(chunks, message.text);
  if (message.role === "system") pushTrimmed(chunks, message.command);
  if (message.role === "assistant" && message.parts) {
    for (const part of message.parts) {
      if ("title" in part) pushTrimmed(chunks, part.title);
      if ("text" in part) pushTrimmed(chunks, part.text);
      if (part.type === "tool") {
        if (part.result != null) pushTrimmed(chunks, stringifySearchValue(part.result));
        pushTrimmed(chunks, stringifySearchValue(part.args));
      }
    }
  }
  return chunks.join("\n").trim();
}

export function messagesToSearchText(messages: readonly ChatMessage[]): string {
  return messages
    .map(messageToSearchText)
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

interface CacheEntry {
  mtimeMs: number;
  size: number;
  value: SessionSearchText;
}

/** LRU cache bounded by total characters of cached text. */
export class SearchTextCache {
  private readonly entries = new Map<string, CacheEntry>();
  private totalChars = 0;

  constructor(private readonly maxChars: number) {}

  get(filePath: string, mtimeMs: number, size: number): SessionSearchText | null {
    const entry = this.entries.get(filePath);
    if (!entry) return null;
    if (entry.mtimeMs !== mtimeMs || entry.size !== size) {
      this.delete(filePath);
      return null;
    }
    // Refresh recency.
    this.entries.delete(filePath);
    this.entries.set(filePath, entry);
    return entry.value;
  }

  set(filePath: string, mtimeMs: number, size: number, value: SessionSearchText): void {
    this.delete(filePath);
    if (value.text.length > this.maxChars) return;
    this.entries.set(filePath, { mtimeMs, size, value });
    this.totalChars += value.text.length;
    for (const [key, entry] of this.entries) {
      if (this.totalChars <= this.maxChars) break;
      this.entries.delete(key);
      this.totalChars -= entry.value.text.length;
    }
  }

  get size(): number {
    return this.entries.size;
  }

  private delete(filePath: string): void {
    const entry = this.entries.get(filePath);
    if (!entry) return;
    this.entries.delete(filePath);
    this.totalChars -= entry.value.text.length;
  }
}
