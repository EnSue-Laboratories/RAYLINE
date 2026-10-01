// Pure helpers for MenuSelect: anchored positioning and keyboard navigation.

export interface AnchorRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
}

export interface AnchoredMenuPosition {
  top: number;
  left: number;
  minWidth: number;
  maxHeight: number;
}

export type MenuAlign = "start" | "end";

const EDGE = 8;
const GAP = 6;
const MAX_HEIGHT = 360;

/**
 * Places a menu under its trigger (flipped above when there's more room
 * there), at least as wide as the trigger, clamped inside the viewport.
 */
export function computeAnchoredMenuPosition(
  rect: AnchorRect,
  viewport: { width: number; height: number },
  options: { minWidth?: number; align?: MenuAlign; estimatedHeight?: number } = {},
): AnchoredMenuPosition {
  const minWidth = Math.min(Math.max(rect.width, options.minWidth ?? 0), viewport.width - EDGE * 2);
  const wanted = Math.min(options.estimatedHeight ?? MAX_HEIGHT, MAX_HEIGHT);
  const below = viewport.height - rect.bottom - GAP - EDGE;
  const above = rect.top - GAP - EDGE;
  const up = below < wanted && above > below;
  const maxHeight = Math.max(80, Math.min(MAX_HEIGHT, up ? above : below));
  const height = Math.min(wanted, maxHeight);
  const rawLeft = options.align === "end" ? rect.right - minWidth : rect.left;
  return {
    minWidth,
    maxHeight,
    left: Math.max(EDGE, Math.min(rawLeft, viewport.width - minWidth - EDGE)),
    top: up ? Math.max(EDGE, rect.top - GAP - height) : Math.min(rect.bottom + GAP, viewport.height - height - EDGE),
  };
}

/** Next enabled index in `delta` direction, wrapping; -1 if nothing is enabled. */
export function moveActiveIndex(enabled: readonly boolean[], current: number, delta: 1 | -1): number {
  const count = enabled.length;
  if (count === 0) return -1;
  let index = current < 0 ? (delta === 1 ? -1 : count) : current;
  for (let step = 0; step < count; step += 1) {
    index = (index + delta + count) % count;
    if (enabled[index]) return index;
  }
  return -1;
}

export function edgeActiveIndex(enabled: readonly boolean[], edge: "first" | "last"): number {
  if (edge === "first") return enabled.indexOf(true);
  return enabled.lastIndexOf(true);
}

/**
 * Type-ahead: the first enabled label starting with `query` (case-insensitive),
 * searching after `current` first so repeated letters cycle through matches.
 */
export function typeaheadIndex(
  labels: readonly string[],
  enabled: readonly boolean[],
  query: string,
  current: number,
): number {
  const needle = query.trim().toLowerCase();
  if (!needle) return current;
  const count = labels.length;
  const singleLetterRepeat = needle.length > 1 && [...needle].every((ch) => ch === needle[0]);
  const effective = singleLetterRepeat ? needle.slice(0, 1) : needle;
  const startOffset = effective.length === 1 ? 1 : 0;
  for (let step = 0; step < count; step += 1) {
    const index = (Math.max(current, 0) + startOffset + step) % count;
    if (enabled[index] && (labels[index] ?? "").toLowerCase().startsWith(effective)) return index;
  }
  return current;
}
