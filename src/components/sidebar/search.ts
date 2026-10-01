/**
 * Sidebar full-text search: pure text extraction, matching and keying.
 * The async runner lives in ./searchRunner, the React glue in ./useSidebarSearch.
 */
import type { SidebarConversation } from "./types";

export function normalizeSearchText(value: string | null | undefined): string {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function getSearchTokens(query: string): string[] {
  return normalizeSearchText(query).split(" ").filter(Boolean);
}

/** Every token must appear (AND). An empty token list matches everything. */
export function matchesSearch(text: string, tokens: readonly string[]): boolean {
  if (!tokens.length) return true;
  if (!text) return false;
  return tokens.every((token) => text.includes(token));
}

export function stringifySearchValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    // Circular structures / BigInt: nothing useful to search.
    return typeof value === "bigint" ? value.toString() : "";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function pushTrimmed(chunks: string[], value: unknown): void {
  if (typeof value !== "string") return;
  const trimmed = value.trim();
  if (trimmed) chunks.push(trimmed);
}

/**
 * Searchable text of one archived message: text/command plus every part's
 * title, text, tool result and tool args. Accepts unknown because archives can
 * come from older app versions.
 */
export function getMessageSearchText(message: unknown): string {
  if (!isRecord(message)) return "";
  const chunks: string[] = [];
  pushTrimmed(chunks, message.text);
  pushTrimmed(chunks, message.command);
  const parts: unknown = message.parts;
  if (Array.isArray(parts)) {
    const list: readonly unknown[] = parts;
    for (const part of list) {
      if (!isRecord(part)) continue;
      pushTrimmed(chunks, part.title);
      pushTrimmed(chunks, part.text);
      if (part.result != null) pushTrimmed(chunks, stringifySearchValue(part.result));
      if (part.args != null) pushTrimmed(chunks, stringifySearchValue(part.args));
    }
  }
  return chunks.join("\n").trim();
}

/** Native session ids whose on-disk transcripts belong to this conversation. */
export function getConversationSearchSessionIds(conversation: SidebarConversation): string[] {
  const ids = new Set<string>();
  if (conversation.sessionId) ids.add(conversation.sessionId);
  for (const session of conversation.sessions ?? []) {
    if (session.nativeSessionId) ids.add(session.nativeSessionId);
  }
  return [...ids];
}

export function getConversationLocalSearchBody(conversation: SidebarConversation): string {
  const chunks: string[] = [];
  pushTrimmed(chunks, conversation.lastPreview);
  for (const message of conversation.archivedMessages ?? []) {
    const text = getMessageSearchText(message);
    if (text) chunks.push(text);
  }
  return chunks.join("\n\n").trim();
}

/**
 * The parts of a row that should restart a search. Deliberately excludes the
 * streaming preview (it changes every ~500 ms while a chat streams, which used
 * to restart the search forever — PERF.md #10). The row's `isStreaming` flip
 * at the end of a run triggers one re-search with the final content.
 */
export function getConversationSearchStamp(conversation: SidebarConversation): string {
  return [
    conversation.id,
    conversation.updatedAt ?? conversation.ts ?? 0,
    conversation.title || "",
    conversation.isStreaming ? "~streaming~" : conversation.lastPreview || "",
  ].join("::");
}

/** Cache version of a conversation's search record (stamp + transcript shape). */
export function buildConversationSearchVersion(conversation: SidebarConversation): string {
  return [
    getConversationSearchStamp(conversation),
    conversation.archivedMessages?.length ?? 0,
    getConversationSearchSessionIds(conversation).join("|"),
  ].join("::");
}

/** Effect key for a search run: the normalized query plus every row's stamp. */
export function buildSearchKey(query: string, convos: readonly SidebarConversation[]): string {
  if (!query) return "";
  let key = `${query}\n--`;
  for (const conversation of convos) key += `\n${getConversationSearchStamp(conversation)}`;
  return key;
}

/** ~`limit`-char window of `sourceText` centred on the first hit, with ellipses. */
export function buildSearchExcerpt(
  sourceText: string,
  query: string,
  tokens: readonly string[],
  limit = 96,
): string {
  const collapsed = String(sourceText || "").replace(/\s+/g, " ").trim();
  if (!collapsed) return "";

  const lower = collapsed.toLowerCase();
  let matchIndex = query ? lower.indexOf(query) : -1;
  let matchLength = matchIndex >= 0 ? query.length : 0;

  if (matchIndex < 0) {
    for (const token of tokens) {
      const idx = lower.indexOf(token);
      if (idx >= 0 && (matchIndex < 0 || idx < matchIndex)) {
        matchIndex = idx;
        matchLength = token.length;
      }
    }
  }

  if (matchIndex < 0) {
    return collapsed.length > limit ? `${collapsed.slice(0, limit - 1).trim()}…` : collapsed;
  }

  const desiredStart = Math.max(0, matchIndex - Math.floor((limit - Math.max(matchLength, 12)) / 2));
  const start = Math.min(desiredStart, Math.max(0, collapsed.length - limit));
  const end = Math.min(collapsed.length, start + limit);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < collapsed.length ? "…" : "";
  return `${prefix}${collapsed.slice(start, end).trim()}${suffix}`;
}

export interface SearchRecord {
  version: string;
  titleText: string;
  titleSearchText: string;
  bodyText: string;
  bodySearchText: string;
}

export function createSearchRecord(
  conversation: SidebarConversation,
  sessionTexts: readonly string[],
  version = buildConversationSearchVersion(conversation),
): SearchRecord {
  const titleText = String(conversation.title || "").trim();
  const sessionBodyText = sessionTexts.filter(Boolean).join("\n\n").trim();
  const bodyText = [getConversationLocalSearchBody(conversation), sessionBodyText]
    .filter(Boolean)
    .join("\n\n")
    .trim();
  return {
    version,
    titleText,
    titleSearchText: normalizeSearchText(titleText),
    bodyText,
    bodySearchText: normalizeSearchText(bodyText),
  };
}

/**
 * `undefined` = no match; otherwise the hit's preview (an excerpt when the
 * body matched, null for a title-only hit).
 */
export function matchSearchRecord(
  record: SearchRecord,
  query: string,
  tokens: readonly string[],
): string | null | undefined {
  const titleMatch = matchesSearch(record.titleSearchText, tokens);
  const bodyMatch = matchesSearch(record.bodySearchText, tokens);
  if (!titleMatch && !bodyMatch) return undefined;
  const preview = bodyMatch ? buildSearchExcerpt(record.bodyText, query, tokens) : "";
  return preview || null;
}
