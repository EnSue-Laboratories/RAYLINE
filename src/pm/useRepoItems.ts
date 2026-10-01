import { useEffect, useMemo, useRef, useState } from "react";
import { useStableCallback } from "../hooks/useStableCallback";
import { errorMessage } from "./format";
import { freshItemMatchesScope, insertFreshItem, mergeFetchedItems } from "./listing";
import type { FreshItem, ListItemCore, PmStateFilter } from "./types";

const POLL_INTERVAL_MS = 30_000;
const EMPTY: never[] = [];

export interface RepoItemsOptions<T extends ListItemCore> {
  repos: string[];
  stateFilter: PmStateFilter;
  repoFilter: string | null;
  /** Bumped by the parent to force a refetch. */
  refreshSignal: number;
  /** Item just created in CreateForm; shown optimistically until listed. */
  freshItem: FreshItem<T> | null;
  /** Lists one repo; rows get tagged with `_repo` here. */
  fetchRepo: (repo: string, state: PmStateFilter) => Promise<Array<Omit<T, "_repo">>>;
  failedMessage: string;
}

export interface RepoItems<T> {
  items: T[];
  initialLoad: boolean;
  error: string | null;
  /** Non-silent reload (shows the loading state), e.g. from a Retry button. */
  reload: () => void;
}

/**
 * Issues / PRs across the selected repos: fetched when the scope changes,
 * polled every 30 s, newest first. Unchanged polls keep the previous array
 * (no re-render), and responses from superseded requests are dropped.
 */
export function useRepoItems<T extends ListItemCore>({
  repos,
  stateFilter,
  repoFilter,
  refreshSignal,
  freshItem,
  fetchRepo,
  failedMessage,
}: RepoItemsOptions<T>): RepoItems<T> {
  const [items, setItems] = useState<T[]>([]);
  const [initialLoad, setInitialLoad] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const load = useStableCallback(async () => {
    const requestId = ++requestIdRef.current;
    try {
      const targetRepos = repoFilter ? [repoFilter] : repos;
      const results = await Promise.all(targetRepos.map(async (repo) => {
        const rows = await fetchRepo(repo, stateFilter);
        return rows.map((row) => ({ ...row, _repo: repo }) as T);
      }));
      if (requestId !== requestIdRef.current) return;
      setItems((prev) => mergeFetchedItems(prev, results.flat()));
      setError(null);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(errorMessage(err) || failedMessage);
    } finally {
      if (requestId === requestIdRef.current) setInitialLoad(false);
    }
  });

  const hasRepos = repos.length > 0;

  useEffect(() => {
    if (!hasRepos) return;
    void load();
    const interval = window.setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [hasRepos, repos, stateFilter, repoFilter, refreshSignal, load]);

  // Insert a just-created item once per new `freshItem` (state adjusted
  // during render — React's pattern for reacting to a changed prop).
  const [seenFresh, setSeenFresh] = useState<FreshItem<T> | null>(null);
  if (freshItem !== seenFresh) {
    setSeenFresh(freshItem);
    if (freshItem && freshItemMatchesScope(freshItem, { stateFilter, repoFilter, repos })) {
      const fresh = freshItem as unknown as T;
      setItems((prev) => insertFreshItem(prev, fresh));
    }
  }

  // Rows of removed repos disappear immediately rather than on the next fetch.
  const visibleItems = useMemo(
    () => (hasRepos ? items.filter((item) => repos.includes(item._repo)) : EMPTY),
    [hasRepos, items, repos],
  );

  return {
    items: visibleItems,
    initialLoad: hasRepos && initialLoad,
    error: hasRepos ? error : null,
    reload: () => {
      setInitialLoad(true);
      setError(null);
      void load();
    },
  };
}
