export const PROJECT_CONVO_MAX_HEIGHT = 320;
export const PROJECT_CONVO_BASE_ROW_HEIGHT = 76;
export const PROJECT_CONVO_VIRTUALIZE_AFTER = 8;
export const PROJECT_CONVO_OVERSCAN = 3;

/** Row height scaled with the font size, never below the base height. */
export function getConversationRowHeight(scaledBaseHeight: number): number {
  return Math.max(PROJECT_CONVO_BASE_ROW_HEIGHT, Math.ceil(scaledBaseHeight));
}

export interface VirtualWindow {
  viewportHeight: number;
  totalHeight: number;
  /** Inclusive. */
  startIndex: number;
  /** Exclusive. */
  endIndex: number;
}

/** Visible slice (plus overscan) of a fixed-row-height list scrolled to `scrollTop`. */
export function computeVirtualWindow(
  count: number,
  rowHeight: number,
  scrollTop: number,
  maxHeight = PROJECT_CONVO_MAX_HEIGHT,
  overscan = PROJECT_CONVO_OVERSCAN,
): VirtualWindow {
  const viewportHeight = Math.min(maxHeight, count * rowHeight);
  const totalHeight = count * rowHeight;
  const scrollOffset = Math.min(scrollTop, Math.max(0, totalHeight - viewportHeight));
  const startIndex = Math.max(0, Math.floor(scrollOffset / rowHeight) - overscan);
  const endIndex = Math.min(count, Math.ceil((scrollOffset + viewportHeight) / rowHeight) + overscan);
  return { viewportHeight, totalHeight, startIndex, endIndex };
}
