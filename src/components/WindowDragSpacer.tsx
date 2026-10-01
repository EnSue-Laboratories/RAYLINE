import {
  IS_MAC,
  SIDEBAR_CHROME_RAIL_HEIGHT,
  SIDEBAR_CHROME_RAIL_LEFT,
  SIDEBAR_CHROME_RAIL_TOP,
  SIDEBAR_CHROME_RAIL_WIDTH,
  WINDOW_DRAG_HEIGHT,
} from "../windowChrome";
import { DRAG, NO_DRAG } from "./sidebar/appRegion";

const RAIL_HIT_PADDING = 8;
/** Width of the Windows fixed header overlay (SidebarWindowsHeader). */
const WIN_HEADER_RESERVE_WIDTH = 220;

export interface WindowDragSpacerProps {
  /** macOS: keep the floating sidebar rail clickable inside the drag strip. */
  reserveSidebarRail?: boolean;
  /** Windows: keep SidebarWindowsHeader's buttons clickable. */
  reserveWindowsHeader?: boolean;
}

/** Top-of-pane window drag strip with no-drag holes for floating controls. */
export default function WindowDragSpacer({ reserveSidebarRail = true, reserveWindowsHeader = false }: WindowDragSpacerProps) {
  const showRailReserve = reserveSidebarRail && IS_MAC;
  return (
    <div
      aria-hidden="true"
      style={{
        height: WINDOW_DRAG_HEIGHT,
        ...DRAG,
        flexShrink: 0,
        position: "relative",
      }}
    >
      {showRailReserve && (
        <div
          style={{
            position: "absolute",
            top: Math.max(0, SIDEBAR_CHROME_RAIL_TOP - RAIL_HIT_PADDING),
            left: Math.max(0, SIDEBAR_CHROME_RAIL_LEFT - RAIL_HIT_PADDING),
            width: SIDEBAR_CHROME_RAIL_WIDTH + RAIL_HIT_PADDING * 2,
            height: SIDEBAR_CHROME_RAIL_HEIGHT + RAIL_HIT_PADDING * 2,
            ...NO_DRAG,
            pointerEvents: "auto",
            zIndex: 1,
          }}
        />
      )}
      {reserveWindowsHeader && (
        // pointerEvents must be "auto": Electron ignores no-drag on pointer-events:none elements.
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: WIN_HEADER_RESERVE_WIDTH,
            height: WINDOW_DRAG_HEIGHT,
            ...NO_DRAG,
            pointerEvents: "auto",
            zIndex: 1,
          }}
        />
      )}
    </div>
  );
}
