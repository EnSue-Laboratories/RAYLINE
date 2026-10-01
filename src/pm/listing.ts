import { normalizeGitHubState } from "../pm-components/githubState";
import { itemKey } from "./format";
import type { FreshItem, ListItemCore, PmStateFilter } from "./types";

function updatedAt(item: { updated_at: string }): number {
  return new Date(item.updated_at).getTime();
}

export function sortByUpdatedDesc<T extends { updated_at: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => updatedAt(b) - updatedAt(a));
}

/** Same rows in the same order with the same server timestamps/state. */
export function isSameItemList<T extends ListItemCore>(a: readonly T[], b: readonly T[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((item, i) => {
    const other = b[i];
    return other !== undefined
      && item._repo === other._repo
      && item.number === other.number
      && item.updated_at === other.updated_at
      && item.state === other.state
      && item.title === other.title
      && Boolean(item.__optimistic) === Boolean(other.__optimistic);
  });
}

/**
 * Merges a fresh server listing into the current rows: optimistic rows the
 * server doesn't return yet are kept, everything is sorted newest-first, and
 * an unchanged result returns `prev` so polling doesn't re-render.
 */
export function mergeFetchedItems<T extends ListItemCore>(prev: T[], fetched: T[]): T[] {
  const fetchedKeys = new Set(fetched.map((item) => itemKey(item._repo, item.number)));
  const stillPending = prev.filter((item) => item.__optimistic && !fetchedKeys.has(itemKey(item._repo, item.number)));
  const next = sortByUpdatedDesc([...stillPending, ...fetched]);
  return isSameItemList(prev, next) ? prev : next;
}

export interface ListScope {
  stateFilter: PmStateFilter;
  repoFilter: string | null;
  repos: readonly string[];
}

/** Whether a just-created item belongs in the list currently shown. */
export function freshItemMatchesScope<T extends ListItemCore>(fresh: FreshItem<T>, scope: ListScope): fresh is FreshItem<T> & { number: number } {
  if (fresh.number == null) return false;
  if (normalizeGitHubState(fresh.state) !== scope.stateFilter) return false;
  if (scope.repoFilter && fresh._repo !== scope.repoFilter) return false;
  return scope.repos.includes(fresh._repo);
}

/** Prepends a just-created item as optimistic unless it's already listed. */
export function insertFreshItem<T extends ListItemCore>(prev: T[], fresh: T): T[] {
  const key = itemKey(fresh._repo, fresh.number);
  if (prev.some((item) => itemKey(item._repo, item.number) === key)) return prev;
  return [{ ...fresh, __optimistic: true }, ...prev];
}

/** Case-insensitive substring filter; returns the input for an empty query. */
export function filterByQuery<T>(items: readonly T[], query: string, getText: (item: T) => string): readonly T[] {
  if (!query) return items;
  const needle = query.toLowerCase();
  return items.filter((item) => getText(item).toLowerCase().includes(needle));
}
