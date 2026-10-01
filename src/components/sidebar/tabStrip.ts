import type { TabState } from "../Tab";

export interface TabStripTab {
  id: string;
  title: string;
  state: TabState;
}

export interface TabStripCompareProps {
  tabs: readonly TabStripTab[];
  activeId: string | null | undefined;
  onSelect: unknown;
  onClose: unknown;
}

/** Same tabs by content (App rebuilds the array on every stream flush). */
export function sameTabs(a: readonly TabStripTab[], b: readonly TabStripTab[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((tab, i) => {
    const other = b[i];
    return other !== undefined && tab.id === other.id && tab.title === other.title && tab.state === other.state;
  });
}

export function areTabStripPropsEqual(prev: TabStripCompareProps, next: TabStripCompareProps): boolean {
  return (
    prev.activeId === next.activeId &&
    prev.onSelect === next.onSelect &&
    prev.onClose === next.onClose &&
    sameTabs(prev.tabs, next.tabs)
  );
}

/** ≤6 tabs stretch to fill the strip; more scroll at a fixed width. */
export function getTabSlotStyle(tabCount: number): { flex: string; minWidth: number; maxWidth: number | "none" } {
  const stretch = tabCount > 0 && tabCount <= 6;
  return {
    flex: stretch ? "1 0 0" : "0 0 auto",
    minWidth: stretch ? 132 : 176,
    maxWidth: stretch ? "none" : 240,
  };
}
