import type { CSSProperties, FocusEvent, MouseEvent } from "react";

type FieldEvent = MouseEvent<HTMLElement> | FocusEvent<HTMLElement>;
const onFieldHoverIn = (e: FieldEvent) => { e.currentTarget.style.borderColor = "var(--control-bg-active)"; };
const onFieldHoverOut = (e: FieldEvent) => { e.currentTarget.style.borderColor = "var(--control-bg)"; };

/** Border highlight on hover / focus for text fields. */
export const fieldHoverProps = {
  onMouseEnter: onFieldHoverIn,
  onMouseLeave: onFieldHoverOut,
  onFocus: onFieldHoverIn,
  onBlur: onFieldHoverOut,
};

// Dispatch card styles — mirror NewChatCard conventions.
export const backdropStyle: CSSProperties = {
  position: "fixed", inset: 0, background: "var(--overlay-bg)",
  display: "flex", alignItems: "center", justifyContent: "center",
  zIndex: 1000, backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
};
export const cardStyle: CSSProperties = {
  width: 820, maxWidth: "90vw", maxHeight: "85vh",
  background: "var(--pane-elevated)",
  backdropFilter: "blur(48px) saturate(1.2)",
  WebkitBackdropFilter: "blur(48px) saturate(1.2)",
  border: "1px solid var(--pane-border)",
  borderRadius: 12, display: "flex", flexDirection: "column",
  color: "var(--text-primary)", fontFamily: "var(--font-ui)", fontSize: 13,
  boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
};
export const headerStyle: CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "flex-start",
  gap: 12,
  padding: "14px 18px", borderBottom: "1px solid var(--pane-border)",
};
export const headerTextStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 5, minWidth: 0 };
export const titleStyle: CSSProperties = { fontSize: 14, fontWeight: 500 };
export const subtitleStyle: CSSProperties = {
  fontSize: 11,
  color: "var(--text-muted)",
  lineHeight: 1.45,
};
export const closeBtnStyle: CSSProperties = {
  background: "none", border: "none", color: "var(--text-secondary)",
  cursor: "pointer", padding: 4,
};
export const tabsStyle: CSSProperties = {
  display: "flex", alignItems: "flex-end", gap: 4, padding: "10px 14px 0",
  borderBottom: "1px solid var(--pane-border)",
};
export const tabBtnStyle = (active: boolean, hovered: boolean): CSSProperties => ({
  display: "flex", gap: 6, alignItems: "center",
  padding: "8px 12px", borderRadius: "6px 6px 0 0",
  background: active ? "var(--pane-hover)" : "transparent",
  color: active
    ? "var(--text-primary)"
    : hovered ? "var(--text-primary)" : "var(--text-secondary)",
  border: "none", borderBottom: active ? "1px solid var(--text-primary)" : "1px solid transparent",
  cursor: "pointer", fontSize: 12,
  transition: "color .2s",
});
export const bodyStyle: CSSProperties = { flex: 1, overflow: "auto", padding: 0 };
export const footerStyle: CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  padding: "12px 18px", borderTop: "1px solid var(--pane-border)",
};
export const primaryBtnStyle = (enabled: boolean, loading: boolean): CSSProperties => ({
  position: "relative",
  padding: "8px 14px", borderRadius: 6, border: "none",
  background: loading ? "var(--text-primary)" : (enabled ? "var(--text-primary)" : "var(--control-bg-active)"),
  color: loading ? "var(--text-inverse)" : (enabled ? "var(--text-inverse)" : "var(--text-muted)"),
  cursor: loading ? "progress" : (enabled ? "pointer" : "not-allowed"),
  fontSize: 12, fontWeight: 500,
  display: "inline-flex", alignItems: "center", justifyContent: "center",
});

export const noticeStyle: CSSProperties = {
  background: "var(--warning-bg)", border: "1px solid var(--warning-border)",
  color: "var(--warning-text)", borderRadius: 6, padding: "8px 10px",
  fontSize: 12, marginBottom: 10,
};
export const addBtnStyle: CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6,
  background: "transparent",
  border: "none",
  color: "var(--text-muted)",
  padding: "6px 8px",
  borderRadius: 6,
  marginTop: 2,
  cursor: "pointer", fontSize: 11,
  fontFamily: "var(--font-mono)",
  letterSpacing: ".06em",
  transition: "color .15s, background .15s",
};

export const autoNoteStyle: CSSProperties = {
  color: "var(--text-secondary)",
  fontSize: 11,
  fontFamily: "var(--font-mono)",
  marginBottom: 10,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};
export const autoPanelStyle: CSSProperties = {
  border: "1px solid var(--control-bg-strong)",
  borderRadius: 8,
  background: "var(--control-bg-subtle)",
  overflow: "hidden",
};
export const autoPanelHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  padding: "10px 12px",
  borderBottom: "1px solid var(--control-bg-strong)",
};
export const autoTitleStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  color: "var(--text-primary)",
  fontSize: 12,
  fontWeight: 500,
};
export const autoTextareaStyle: CSSProperties = {
  width: "100%",
  minHeight: 132,
  resize: "vertical",
  background: "var(--control-bg-contrast)",
  color: "var(--text-primary)",
  border: "1px solid var(--control-bg)",
  borderRadius: 7,
  padding: "11px 12px",
  fontSize: 12,
  fontFamily: "inherit",
  lineHeight: 1.45,
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color .2s",
};
export const autoErrorStyle: CSSProperties = {
  color: "var(--danger-text-strong)",
  fontSize: 11,
  padding: "9px 12px 0",
};
export const autoActionsStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  padding: 12,
};
export const autoFillBtnStyle = (enabled: boolean, loading: boolean): CSSProperties => ({
  position: "relative",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 60,
  padding: "8px 12px",
  borderRadius: 6,
  border: "none",
  background: loading ? "var(--text-primary)" : (enabled ? "var(--text-primary)" : "var(--control-border)"),
  color: loading ? "var(--text-inverse)" : (enabled ? "var(--text-inverse)" : "var(--text-muted)"),
  cursor: loading ? "progress" : (enabled ? "pointer" : "not-allowed"),
  fontSize: 12,
  fontWeight: 500,
});

export const customRowStyle = (hasError: boolean): CSSProperties => ({
  border: "1px solid " + (hasError ? "var(--danger-border-strong)" : "var(--pane-border)"),
  borderRadius: 8,
  marginBottom: 10,
  background: "var(--control-bg-subtle)",
  overflow: "hidden",
  transition: "border-color .2s",
});
export const customTextareaStyle: CSSProperties = {
  width: "100%",
  minHeight: 72,
  resize: "vertical",
  background: "transparent",
  color: "var(--text-primary)",
  border: "none",
  padding: "12px 12px 8px",
  fontSize: 12,
  fontFamily: "inherit",
  outline: "none",
  boxSizing: "border-box",
};
export const customControlsStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  padding: "6px 10px 6px 12px",
  borderTop: "1px solid var(--control-bg)",
  background: "var(--control-bg-subtle)",
};
export const customBranchStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  background: "transparent",
  color: "var(--text-secondary)",
  border: "none",
  padding: "4px 0",
  fontSize: 10,
  fontFamily: "var(--font-mono)",
  letterSpacing: ".06em",
  outline: "none",
};
export const customDividerStyle: CSSProperties = {
  width: 1, height: 12,
  background: "var(--control-bg-strong)",
  flexShrink: 0,
};
export const customErrorStyle: CSSProperties = {
  color: "var(--danger-text-strong)", fontSize: 11,
  padding: "0 12px 8px",
};
