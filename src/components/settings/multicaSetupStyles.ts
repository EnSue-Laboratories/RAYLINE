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
// --surface-glass is ~92% opaque, so the card's own 48px backdrop blur was
// visually negligible but re-ran over the already-blurred backdrop every frame.
export const cardStyle: CSSProperties = {
  width: 440,
  maxWidth: "90vw",
  maxHeight: "85vh",
  background: "var(--surface-glass)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  display: "flex",
  flexDirection: "column",
  color: "var(--text-primary)",
  fontFamily: "var(--font-ui)",
  fontSize: 13,
  boxShadow: "var(--shadow-md)",
};
export const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "14px 18px",
  borderBottom: "1px solid var(--border)",
};
export const titleStyle: CSSProperties = { fontSize: 14, fontWeight: 500 };
export const closeBtnStyle: CSSProperties = { background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", padding: 4 };
export const bodyStyle: CSSProperties = { padding: 18, display: "flex", flexDirection: "column", gap: 12 };
export const hintStyle: CSSProperties = { fontSize: 12, color: "var(--text-secondary)" };
export const footerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  padding: "12px 18px",
  borderTop: "1px solid var(--border)",
};
export const primaryBtnStyle = (enabled: boolean): CSSProperties => ({
  padding: "8px 14px",
  borderRadius: 6,
  border: "none",
  background: enabled ? "var(--text-primary)" : "var(--bg-tertiary)",
  color: enabled ? "var(--bg-primary)" : "var(--text-muted)",
  cursor: enabled ? "pointer" : "not-allowed",
  fontSize: 12,
  fontWeight: 500,
});
export const secondaryBtnStyle: CSSProperties = {
  padding: "8px 14px",
  borderRadius: 6,
  background: "transparent",
  border: "1px solid var(--border)",
  color: "var(--text-secondary)",
  cursor: "pointer",
  fontSize: 12,
};
export const inputStyle: CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 6,
  background: "var(--bg-tertiary)",
  border: "1px solid var(--border)",
  color: "var(--text-primary)",
  fontSize: 13,
  fontFamily: "inherit",
  outline: "none",
};
export const labelStyle: CSSProperties = { fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 };
export const errorStyle: CSSProperties = {
  fontSize: 12,
  color: "var(--accent)",
  background: "var(--hover-overlay)",
  padding: "8px 10px",
  borderRadius: 6,
  border: "1px solid var(--border-strong)",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};
