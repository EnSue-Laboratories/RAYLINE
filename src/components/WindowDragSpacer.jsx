import {
  IS_MAC,
  SIDEBAR_CHROME_RAIL_HEIGHT,
  SIDEBAR_CHROME_RAIL_LEFT,
  SIDEBAR_CHROME_RAIL_TOP,
  SIDEBAR_CHROME_RAIL_WIDTH,
  WINDOW_DRAG_HEIGHT,
} from "../windowChrome";

const RAIL_HIT_PADDING = 8;
// Width of the Windows fixed header overlay (SidebarWindowsHeader)
const WIN_HEADER_RESERVE_WIDTH = 220;

export default function WindowDragSpacer({ reserveSidebarRail = true, reserveWindowsHeader = false }) {
  const showRailReserve = reserveSidebarRail && IS_MAC;
  return (
    <div
      aria-hidden="true"
      style={{
        height: WINDOW_DRAG_HEIGHT,
        WebkitAppRegion: "drag",
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
            WebkitAppRegion: "no-drag",
            pointerEvents: "auto",
            zIndex: 1,
          }}
        />
      )}
      {reserveWindowsHeader && (
        /* Carve out the SidebarWindowsHeader zone so its buttons stay clickable.
           pointerEvents must be "auto" — Electron ignores no-drag on pointer-events:none elements. */
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: WIN_HEADER_RESERVE_WIDTH,
            height: WINDOW_DRAG_HEIGHT,
            WebkitAppRegion: "no-drag",
            pointerEvents: "auto",
            zIndex: 1,
          }}
        />
      )}
    </div>
  );
}
