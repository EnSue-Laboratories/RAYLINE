import type { CSSProperties } from "react";

/** Electron's `-webkit-app-region`, which React's CSSProperties doesn't know. */
export type AppRegionStyle = CSSProperties & { WebkitAppRegion?: "drag" | "no-drag" };

export const MONO_FONT = "'JetBrains Mono', monospace";
export const SYSTEM_FONT = "system-ui, sans-serif";
export const SPIN_KEYFRAMES = "@keyframes spin { to { transform: rotate(360deg) } }";
export const SPIN_ANIMATION = "spin 1s linear infinite";

export const modalBackdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "var(--pm-modal-backdrop)",
  backdropFilter: "blur(var(--pm-modal-backdrop-blur))",
  WebkitBackdropFilter: "blur(var(--pm-modal-backdrop-blur))",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 200,
};

export const modalPanelStyle: CSSProperties = {
  background: "var(--pane-elevated)",
  backdropFilter: "blur(48px) saturate(1.2)",
  WebkitBackdropFilter: "blur(48px) saturate(1.2)",
  borderRadius: 12,
  border: "1px solid var(--pane-border)",
};

export const modalCloseButtonStyle: CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 7,
  border: "1px solid var(--pane-border)",
  background: "var(--pane-hover)",
  color: "var(--text-muted)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  padding: 0,
};

export const smallButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  background: "var(--control-border-soft)",
  border: "1px solid var(--control-border)",
  borderRadius: 6,
  padding: "4px 10px",
  cursor: "pointer",
  color: "var(--text-muted)",
  fontSize: 11,
  fontFamily: MONO_FONT,
  letterSpacing: ".04em",
  transition: "all .15s",
};

export const formInputStyle: CSSProperties = {
  width: "100%",
  background: "var(--control-bg)",
  border: "1px solid var(--control-border)",
  borderRadius: 6,
  padding: "8px 10px",
  color: "var(--text-primary)",
  fontSize: 13,
  fontFamily: "var(--font-ui)",
  boxSizing: "border-box",
};

export const listMessageStyle: CSSProperties = {
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  padding: 40,
  fontFamily: "var(--font-ui)",
  fontSize: 13,
};

export const retryButtonStyle: CSSProperties = {
  background: "var(--control-bg)",
  border: "1px solid var(--control-border)",
  borderRadius: 6,
  color: "var(--text-secondary)",
  padding: "6px 16px",
  cursor: "pointer",
  fontFamily: "var(--font-ui)",
  fontSize: 12,
};

export const dragRegionStyle: AppRegionStyle = {
  position: "fixed",
  top: 0,
  left: 0,
  height: 52,
  WebkitAppRegion: "drag",
  zIndex: 100,
};
