/** Pure placement math for the sidebar / git popovers (fixed-position portals). */

export interface AnchorRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface MenuPosition {
  top: number;
  left: number;
}

export interface SizedMenuPosition extends MenuPosition {
  width: number;
}

export const MENU_GAP = 6;
export const VIEWPORT_PADDING = 8;

export function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

const PROJECT_MENU_WIDTH_RESERVE = 196;
const PROJECT_MENU_HEIGHT_RESERVE = 180;

/** Project "more" menu: below the anchor, clamped inside the window (PR #230). */
export function getProjectMenuPosition(anchor: AnchorRect, viewport: Viewport): MenuPosition {
  return {
    top: Math.min(anchor.bottom + 4, viewport.height - PROJECT_MENU_HEIGHT_RESERVE),
    left: Math.max(VIEWPORT_PADDING, Math.min(anchor.left, viewport.width - PROJECT_MENU_WIDTH_RESERVE)),
  };
}

/**
 * A `width`-wide dropdown under the anchor, left-aligned unless that would
 * overflow the right edge, in which case it right-aligns to the anchor.
 */
export function anchorDropdown(anchor: AnchorRect, width: number, viewport: Pick<Viewport, "width">): SizedMenuPosition {
  const alignRight = anchor.left + width > viewport.width - VIEWPORT_PADDING;
  const left = alignRight
    ? Math.max(VIEWPORT_PADDING, anchor.right - width)
    : Math.min(anchor.left, viewport.width - width - VIEWPORT_PADDING);
  return { top: anchor.bottom + MENU_GAP, left, width };
}

/** Branch selector menu: 240–320px, a bit wider than its trigger. */
export function getBranchMenuPosition(anchor: AnchorRect, viewport: Pick<Viewport, "width">): SizedMenuPosition {
  return anchorDropdown(anchor, Math.min(320, Math.max(240, anchor.width + 24)), viewport);
}

const PICKER_MIN_WIDTH = 240;
const PICKER_MAX_HEIGHT = 360;

export interface PickerMenuPosition extends SizedMenuPosition {
  maxHeight: number;
}

/**
 * Project picker: right-aligned to the trigger, at least 240px wide, flips
 * above the trigger when there isn't room below.
 */
export function getProjectPickerPosition(anchor: AnchorRect, viewport: Viewport): PickerMenuPosition {
  const maxMenuWidth = Math.max(0, viewport.width - VIEWPORT_PADDING * 2);
  const width = Math.min(maxMenuWidth, Math.max(anchor.width, Math.min(PICKER_MIN_WIDTH, maxMenuWidth)));
  const maxHeight = Math.min(PICKER_MAX_HEIGHT, viewport.height - VIEWPORT_PADDING * 2);
  const spaceBelow = viewport.height - anchor.bottom - MENU_GAP - VIEWPORT_PADDING;
  const spaceAbove = anchor.top - MENU_GAP - VIEWPORT_PADDING;
  const placeAbove = spaceBelow < Math.min(maxHeight, 220) && spaceAbove > spaceBelow;
  const left = clamp(anchor.right - width, VIEWPORT_PADDING, viewport.width - width - VIEWPORT_PADDING);
  return {
    top: placeAbove
      ? Math.max(VIEWPORT_PADDING, anchor.top - MENU_GAP - maxHeight)
      : Math.min(anchor.bottom + MENU_GAP, viewport.height - VIEWPORT_PADDING - maxHeight),
    left,
    width,
    maxHeight,
  };
}

export function getViewport(): Viewport {
  return { width: window.innerWidth, height: window.innerHeight };
}
