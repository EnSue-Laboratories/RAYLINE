/** Placement for the new-chat card's portal dropdowns. */

export const MENU_GAP = 6;
export const VIEWPORT_PADDING = 8;

export interface AnchorRect {
  top: number;
  bottom: number;
  left: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface FloatingMenuLayout {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

export function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

/**
 * Below the anchor when there is room (≥ min(maxHeight, 220)px), otherwise
 * above if that side has more space; always kept inside the viewport.
 */
export function getFloatingMenuLayout(
  rect: AnchorRect,
  preferredWidth: number,
  preferredMaxHeight: number,
  viewport: Viewport,
): FloatingMenuLayout {
  const width = Math.min(preferredWidth, Math.max(0, viewport.width - VIEWPORT_PADDING * 2));
  const maxHeight = Math.min(preferredMaxHeight, viewport.height - VIEWPORT_PADDING * 2);
  const spaceBelow = viewport.height - rect.bottom - MENU_GAP - VIEWPORT_PADDING;
  const spaceAbove = rect.top - MENU_GAP - VIEWPORT_PADDING;
  const placeAbove = spaceBelow < Math.min(maxHeight, 220) && spaceAbove > spaceBelow;

  return {
    top: placeAbove
      ? Math.max(VIEWPORT_PADDING, rect.top - MENU_GAP - maxHeight)
      : Math.min(rect.bottom + MENU_GAP, viewport.height - VIEWPORT_PADDING - maxHeight),
    left: clamp(rect.left, VIEWPORT_PADDING, viewport.width - width - VIEWPORT_PADDING),
    width,
    maxHeight,
  };
}
