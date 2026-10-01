import { useEffect, useMemo, useRef, useState } from "react";
import { createArrayStabilizer, createSearchPreviewDecorator } from "./rowStability";
import { buildSearchKey, getSearchTokens, normalizeSearchText } from "./search";
import { runConversationSearch, type SearchMatches, type SearchRecordCache, type SessionTextLoader } from "./searchRunner";
import type { SidebarConversation } from "./types";

const SEARCH_DEBOUNCE_MS = 120;
/** Yield to rendering once a search run has held the main thread this long. */
const FRAME_BUDGET_MS = 10;

const EMPTY_ROWS: readonly SidebarConversation[] = [];
const EMPTY_MATCHES: SearchMatches = new Map();

interface SettledSearch {
  key: string;
  query: string;
  matches: SearchMatches;
}

export interface SidebarSearch {
  /** Normalized query is non-empty. */
  active: boolean;
  /** Matching rows (with `_searchPreview`) in sidebar order. */
  results: readonly SidebarConversation[];
  /** A run for the current key is pending (results may be from the previous run of the same query). */
  loading: boolean;
}

function waitForPaint(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function" && !document.hidden) {
      requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}

function createFrameYielder(): () => Promise<void> {
  let sliceStart = performance.now();
  return async () => {
    if (performance.now() - sliceStart < FRAME_BUDGET_MS) return;
    await waitForPaint();
    sliceStart = performance.now();
  };
}

function getSessionTextLoader(): SessionTextLoader | null {
  const api = window.api;
  if (!api?.loadSessionSearchText) return null;
  return async (sessionId) => {
    const result = await api.loadSessionSearchText(sessionId);
    return result?.text || "";
  };
}

/**
 * Full-text sidebar search. `convos` should be identity-stable while rows are
 * unchanged (see createArrayStabilizer). The run is keyed on the query plus
 * each row's search stamp — not on streaming previews — so it settles while
 * chats stream; session transcripts load 4 at a time and superseded runs are
 * aborted.
 */
export function useSidebarSearch(convos: readonly SidebarConversation[], rawQuery: string): SidebarSearch {
  const query = useMemo(() => normalizeSearchText(rawQuery), [rawQuery]);
  const active = query.length > 0;
  const key = useMemo(() => buildSearchKey(query, convos), [query, convos]);

  const convosRef = useRef(convos);
  const [cache] = useState<SearchRecordCache>(() => new Map());
  const [decorate] = useState(createSearchPreviewDecorator);
  const [stabilize] = useState(() => createArrayStabilizer<SidebarConversation>());
  const [settled, setSettled] = useState<SettledSearch | null>(null);

  // Declared before the search effect so it runs first in the same commit.
  useEffect(() => {
    convosRef.current = convos;
  }, [convos]);

  useEffect(() => {
    if (!key) return undefined;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      runConversationSearch({
        convos: convosRef.current,
        query,
        tokens: getSearchTokens(query),
        cache,
        loadSessionText: getSessionTextLoader(),
        signal: controller.signal,
        yieldToHost: createFrameYielder(),
      }).then(
        (matches) => {
          if (!controller.signal.aborted) setSettled({ key, query, matches });
        },
        () => {
          if (!controller.signal.aborted) setSettled({ key, query, matches: EMPTY_MATCHES });
        },
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [cache, key, query]);

  // Results of the same query stay visible while a re-run is pending.
  const current = active && settled?.query === query ? settled : null;

  const results = useMemo(() => {
    if (!current) return EMPTY_ROWS;
    const rows: SidebarConversation[] = [];
    for (const row of convos) {
      if (!current.matches.has(row.id)) continue;
      rows.push(decorate(row, current.matches.get(row.id) ?? null));
    }
    return stabilize(rows);
  }, [convos, current, decorate, stabilize]);

  return {
    active,
    results,
    loading: active && settled?.key !== key,
  };
}
