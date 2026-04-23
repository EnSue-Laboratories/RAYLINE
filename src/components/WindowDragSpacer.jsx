import {
  SIDEBAR_CHROME_RAIL_HEIGHT,
  SIDEBAR_CHROME_RAIL_LEFT,
  SIDEBAR_CHROME_RAIL_TOP,
  SIDEBAR_CHROME_RAIL_WIDTH,
  WINDOW_DRAG_HEIGHT,
} from "../windowChrome";

const RAIL_HIT_PADDING = 8;

export default function WindowDragSpacer({ reserveSidebarRail = true }) {
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
      {reserveSidebarRail && (
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
    </div>
  );
}
