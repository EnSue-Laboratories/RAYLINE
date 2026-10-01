import type { CSSProperties } from "react";
import type { FontScale } from "../../contexts/FontSizeContext";

export const SHEET_BG = "var(--pane-elevated)";
export const SHEET_HOVER = "var(--pane-interaction-hover-fill, var(--pane-hover))";
export const SHEET_ACTIVE = "var(--pane-interaction-active-fill, var(--pane-active))";
export const SHEET_BORDER = "var(--pane-border)";

export const inputBase: CSSProperties = {
  background: "transparent",
  border: "none",
  outline: "none",
  color: "var(--text-primary)",
  fontFamily: "var(--font-ui)",
};

export const chipIconStyle: CSSProperties = {
  width: 13,
  height: 13,
  flexShrink: 0,
  strokeWidth: 2,
};

export const chipLabelStyle: CSSProperties = {
  maxWidth: 140,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

export function toolBtnStyle(active: boolean, s: FontScale): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "5px 11px",
    background: active ? SHEET_ACTIVE : SHEET_HOVER,
    backdropFilter: active ? "var(--pane-interaction-active-filter, none)" : "var(--pane-interaction-hover-filter, none)",
    border: `1px solid ${active ? "var(--control-bg-active)" : SHEET_BORDER}`,
    borderRadius: 999,
    color: active ? "var(--text-primary)" : "var(--text-secondary)",
    fontSize: s(10.5),
    fontFamily: "var(--font-ui)",
    fontWeight: 600,
    cursor: "pointer",
    transition: "all .2s",
    letterSpacing: ".01em",
    boxShadow: active ? "var(--pane-interaction-active-shadow, inset 0 0 0 1px var(--control-border))" : "var(--pane-interaction-hover-shadow, none)",
  };
}

export function sheetInputStyle(s: FontScale): CSSProperties {
  return {
    background: SHEET_HOVER,
    border: "none",
    outline: "none",
    padding: "8px 10px",
    fontSize: s(11),
    fontFamily: "var(--font-mono)",
    color: "var(--text-primary)",
    borderBottom: "1px solid var(--pane-border)",
    borderRadius: "7px 7px 0 0",
  };
}

export function sheetNoticeStyle(s: FontScale): CSSProperties {
  return { padding: "12px 10px", fontSize: s(10), color: "var(--text-muted)", fontFamily: "var(--font-mono)" };
}

export function neutralItemStyle(s: FontScale): CSSProperties {
  return {
    display: "flex",
    width: "100%",
    padding: "8px 10px",
    background: "transparent",
    border: "none",
    borderRadius: 7,
    color: "var(--text-secondary)",
    fontSize: s(11),
    fontFamily: "var(--font-mono)",
    cursor: "pointer",
    textAlign: "left",
    transition: "all .12s",
  };
}

/** Hover highlight for sheet rows (inline, no state). */
export const sheetRowHover = {
  onMouseEnter: (e: { currentTarget: HTMLElement }) => { e.currentTarget.style.background = SHEET_HOVER; },
  onMouseLeave: (e: { currentTarget: HTMLElement }) => { e.currentTarget.style.background = "transparent"; },
};

/** True for Enter presses that aren't IME composition commits. */
export function isPlainEnter(e: { key: string; shiftKey?: boolean; nativeEvent: KeyboardEvent }): boolean {
  return e.key === "Enter" && !e.nativeEvent.isComposing && e.nativeEvent.keyCode !== 229;
}

/** The new-chat sheet; accent tint while files are dragged over it. */
export function cardStyle(dragOver: boolean): CSSProperties {
  return {
    maxWidth: 600,
    width: "100%",
    background: dragOver ? "var(--accent-bg)" : SHEET_BG,
    backdropFilter: "blur(48px) saturate(1.2)",
    border: `1px solid ${dragOver ? "var(--accent-border)" : SHEET_BORDER}`,
    borderRadius: 14,
    padding: "20px 20px 10px",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    transition: "all .2s",
    maxHeight: "100%",
    overflowY: "auto",
  };
}

/**
 * Primary "create" action, styled like the model / project chips (mono,
 * uppercase) so it reads as part of the same control row.
 */
export function createChipStyle(enabled: boolean, s: FontScale): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    marginLeft: "auto",
    padding: "4px 12px",
    background: enabled ? "var(--control-bg-active, var(--control-bg))" : "var(--control-bg)",
    border: "1px solid var(--control-border)",
    borderRadius: 7,
    color: enabled ? "var(--text-primary)" : "var(--text-muted)",
    fontSize: s(10),
    fontFamily: "var(--font-mono)",
    letterSpacing: ".06em",
    textTransform: "uppercase",
    cursor: enabled ? "pointer" : "default",
    opacity: enabled ? 1 : 0.6,
    transition: "background .15s, color .15s, opacity .15s",
  };
}
