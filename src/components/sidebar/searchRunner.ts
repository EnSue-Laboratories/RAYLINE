import { mapWithConcurrency } from "./concurrency";
import {
  buildConversationSearchVersion,
  createSearchRecord,
  getConversationSearchSessionIds,
  matchSearchRecord,
  type SearchRecord,
} from "./search";
import type { SidebarConversation } from "./types";

/** At most this many `load-session-search-text` IPC calls in flight (PERF.md #4). */
export const SEARCH_CONCURRENCY = 4;

/** Loads a native session's transcript text; resolve "" when unavailable. */
export type SessionTextLoader = (sessionId: string) => Promise<string>;

export type SearchRecordCache = Map<string, SearchRecord>;

/** conversation id → preview (excerpt, or null for a title-only hit), in row order. */
export type SearchMatches = ReadonlyMap<string, string | null>;

export interface SearchRunOptions {
  convos: readonly SidebarConversation[];
  /** Normalized query (see normalizeSearchText). */
  query: string;
  tokens: readonly string[];
  cache: SearchRecordCache;
  loadSessionText: SessionTextLoader | null;
  signal: AbortSignal;
  concurrency?: number;
  /** Called between conversations so long runs can yield to rendering. */
  yieldToHost?: () => Promise<void>;
}

async function loadSearchRecord(
  conversation: SidebarConversation,
  cache: SearchRecordCache,
  loadSessionText: SessionTextLoader | null,
  signal: AbortSignal,
): Promise<SearchRecord> {
  const version = buildConversationSearchVersion(conversation);
  const cached = cache.get(conversation.id);
  if (cached?.version === version) return cached;

  const sessionTexts: string[] = [];
  if (loadSessionText) {
    // Sequential per conversation so the pool bounds total IPC concurrency.
    for (const sessionId of getConversationSearchSessionIds(conversation)) {
      signal.throwIfAborted();
      sessionTexts.push(await loadSessionText(sessionId).catch(() => ""));
    }
  }
  const record = createSearchRecord(conversation, sessionTexts, version);
  // Cache even if this run is later aborted: the next run reuses the work.
  cache.set(conversation.id, record);
  return record;
}

/** Drops cache entries for conversations that no longer exist. */
export function pruneSearchCache(cache: SearchRecordCache, convos: readonly SidebarConversation[]): void {
  if (cache.size === 0) return;
  const ids = new Set(convos.map((c) => c.id));
  for (const id of cache.keys()) {
    if (!ids.has(id)) cache.delete(id);
  }
}

/**
 * Searches every conversation (title, local archive, and on-disk session
 * transcripts) with bounded concurrency. Rejects with the abort reason when
 * `signal` fires, so callers can drop superseded runs.
 */
export async function runConversationSearch({
  convos,
  query,
  tokens,
  cache,
  loadSessionText,
  signal,
  concurrency = SEARCH_CONCURRENCY,
  yieldToHost,
}: SearchRunOptions): Promise<SearchMatches> {
  pruneSearchCache(cache, convos);
  const previews = await mapWithConcurrency(
    convos,
    concurrency,
    async (conversation) => {
      if (yieldToHost) await yieldToHost();
      signal.throwIfAborted();
      const record = await loadSearchRecord(conversation, cache, loadSessionText, signal);
      return matchSearchRecord(record, query, tokens);
    },
    signal,
  );
  signal.throwIfAborted();

  const matches = new Map<string, string | null>();
  previews.forEach((preview, index) => {
    const conversation = convos[index];
    if (conversation && preview !== undefined) matches.set(conversation.id, preview);
  });
  return matches;
}
