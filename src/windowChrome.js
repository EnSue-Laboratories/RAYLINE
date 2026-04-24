export const WINDOW_DRAG_HEIGHT = 52;

export const IS_MAC =
  typeof navigator !== "undefined" && /Mac/i.test(navigator.platform || "");

const TRAFFIC_LIGHT_LEFT = 16;
const TRAFFIC_LIGHT_GROUP_WIDTH = 56;
const TRAFFIC_LIGHT_GAP = 12;
export const MAC_TRAFFIC_LIGHT_SAFE_WIDTH = TRAFFIC_LIGHT_LEFT + TRAFFIC_LIGHT_GROUP_WIDTH + TRAFFIC_LIGHT_GAP;

export const SIDEBAR_TOGGLE_TOP = 11;
export const SIDEBAR_TOGGLE_LEFT = 220;
export const SIDEBAR_TOGGLE_SIZE = 29;

export const SIDEBAR_CHROME_RAIL_LEFT = MAC_TRAFFIC_LIGHT_SAFE_WIDTH - 10;
export const SIDEBAR_CHROME_RAIL_TOP = 12.5;
export const SIDEBAR_CHROME_RAIL_WIDTH = 100;
export const SIDEBAR_CHROME_RAIL_HEIGHT = 28;
