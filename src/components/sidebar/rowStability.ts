import type { SidebarConversation } from "./types";

/**
 * Returns a function that hands back the previous array whenever the next one
 * holds the same items (by identity) in the same order. App rebuilds the row
 * array on every stream flush while reusing row objects, so this turns
 * "new array, same rows" into a stable identity for memo/useMemo deps.
 */
export function createArrayStabilizer<T>(): (next: readonly T[]) => readonly T[] {
  let prev: readonly T[] | null = null;
  return (next) => {
    if (prev === next) return prev;
    if (prev && prev.length === next.length && prev.every((item, index) => item === next[index])) {
      return prev;
    }
    prev = next;
    return next;
  };
}

/**
 * Attaches `_searchPreview` to a row, reusing the decorated object while the
 * source row and preview are unchanged so memoized rows can skip rendering.
 */
export function createSearchPreviewDecorator(): (
  row: SidebarConversation,
  preview: string | null,
) => SidebarConversation {
  const cache = new WeakMap<SidebarConversation, SidebarConversation>();
  return (row, preview) => {
    const hit = cache.get(row);
    if (hit && hit._searchPreview === preview) return hit;
    const decorated: SidebarConversation = { ...row, _searchPreview: preview };
    cache.set(row, decorated);
    return decorated;
  };
}
