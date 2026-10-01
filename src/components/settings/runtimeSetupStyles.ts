/** Fixed dark palette of the first-run runtime setup screen. */

import type { CSSProperties } from "react";
import type { FontScale } from "./deps";

export const RUNTIME_PRIMARY = "rgba(255,255,255,0.88)";
export const RUNTIME_SECONDARY = "rgba(255,255,255,0.48)";
export const RUNTIME_MUTED = "rgba(255,255,255,0.28)";
export const RUNTIME_BORDER = "rgba(255,255,255,0.065)";
export const RUNTIME_FILL = "rgba(255,255,255,0.025)";
export const RUNTIME_ACTIVE = "rgba(255,255,255,0.08)";
export const RUNTIME_UI_FONT = "system-ui, -apple-system, BlinkMacSystemFont, sans-serif";

export function runtimeIconButtonStyle(s: FontScale): CSSProperties {
  return {
    height: 30,
    minWidth: 30,
    padding: "0 9px",
    borderRadius: 7,
    border: `1px solid ${RUNTIME_BORDER}`,
    background: "transparent",
    color: RUNTIME_SECONDARY,
    cursor: "pointer",
    fontSize: s(12),
    fontFamily: RUNTIME_UI_FONT,
    letterSpacing: "0",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  };
}
