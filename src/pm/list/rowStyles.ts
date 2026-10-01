import type { CSSProperties, MouseEvent } from "react";
import { applyPaneInteractionStyle, getPaneInteractionStyle } from "../../utils/paneSurface";

export const rowStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  padding: "10px 16px",
  cursor: "pointer",
  borderBottom: "1px solid var(--control-border-soft)",
  transition: "background .15s, box-shadow .15s, backdrop-filter .15s",
  ...getPaneInteractionStyle("idle"),
};

export const rowTitleStyle: CSSProperties = {
  color: "var(--text-primary)",
  fontFamily: "var(--font-ui)",
  fontSize: 13,
  flex: 1,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

export const rowNumberStyle: CSSProperties = { color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 12 };

export const rowMetaStyle: CSSProperties = {
  marginLeft: 26,
  color: "var(--text-disabled)",
  fontFamily: "var(--font-ui)",
  fontSize: 12,
  marginTop: 2,
};

/**
 * Row hover is applied imperatively (no React state) and reveals the row's
 * action buttons, which are hidden via opacity until hovered.
 */
export function setRowHover(event: MouseEvent<HTMLElement>, hovered: boolean, actionSelector: string): void {
  applyPaneInteractionStyle(event.currentTarget, hovered ? "hover" : "idle");
  event.currentTarget.querySelectorAll<HTMLElement>(actionSelector).forEach((button) => {
    button.style.opacity = hovered ? "1" : "0";
  });
}

/** Tracks which row action showed "copied" (cleared after 1.5 s). */
export const COPIED_RESET_MS = 1500;
