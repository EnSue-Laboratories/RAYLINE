/** Shared styles of the project dialogs (NewProjectModal, ProjectContextModal). */
import type { CSSProperties } from "react";

export const backdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "color-mix(in srgb, var(--bg-primary) 45%, transparent)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
  backdropFilter: "blur(6px)",
  WebkitBackdropFilter: "blur(6px)",
};

export function cardStyle(width: number): CSSProperties {
  return {
    width,
    maxWidth: "90vw",
    maxHeight: "85vh",
    background: "var(--surface-glass)",
    backdropFilter: "blur(48px) saturate(1.2)",
    WebkitBackdropFilter: "blur(48px) saturate(1.2)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    display: "flex",
    flexDirection: "column",
    color: "var(--text-primary)",
    fontFamily: "var(--font-ui)",
    fontSize: 13,
    boxShadow: "var(--shadow-md)",
  };
}

export const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "14px 18px",
  borderBottom: "1px solid var(--border)",
};

export const titleRowStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 8, color: "var(--text-primary)" };
export const titleStyle: CSSProperties = { fontSize: 13, fontWeight: 500 };

export const closeBtnStyle: CSSProperties = {
  background: "none",
  border: "none",
  color: "var(--text-secondary)",
  cursor: "pointer",
  padding: 4,
  display: "flex",
};

/** Scrollable body (PR #230: long content no longer pushes the footer off-screen). */
export function bodyStyle(gap: number): CSSProperties {
  return { overflowY: "auto", minHeight: 0, padding: 18, display: "flex", flexDirection: "column", gap };
}

export const footerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  padding: "12px 18px",
  borderTop: "1px solid var(--border)",
};

export function primaryBtnStyle(enabled: boolean): CSSProperties {
  return {
    padding: "8px 14px",
    borderRadius: 6,
    border: "none",
    background: enabled ? "var(--text-primary)" : "var(--bg-tertiary)",
    color: enabled ? "var(--bg-primary)" : "var(--text-muted)",
    cursor: enabled ? "pointer" : "not-allowed",
    fontSize: 12,
    fontWeight: 500,
  };
}

export const secondaryBtnStyle: CSSProperties = {
  padding: "8px 12px",
  borderRadius: 6,
  background: "transparent",
  border: "1px solid var(--border)",
  color: "var(--text-secondary)",
  cursor: "pointer",
  fontSize: 12,
  display: "flex",
  alignItems: "center",
};

export const inputStyle: CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 6,
  background: "var(--bg-tertiary)",
  border: "1px solid var(--border)",
  color: "var(--text-primary)",
  fontSize: 13,
  fontFamily: "var(--font-mono)",
  outline: "none",
  boxSizing: "border-box",
};

/** Enter that isn't confirming an IME composition (PR #230). */
export function isPlainEnter(event: { key: string; keyCode: number; nativeEvent: { isComposing: boolean } }): boolean {
  return event.key === "Enter" && !event.nativeEvent.isComposing && event.keyCode !== 229;
}
