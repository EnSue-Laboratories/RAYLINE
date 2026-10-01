/**
 * Shared inline styles for the Settings view. Static styles are module
 * constants (stable identity); font-scaled ones are memoized per `s` by
 * `getSettingsStyles` so sections don't rebuild objects every render.
 */

import type { CSSProperties } from "react";
import type { FontScale } from "./deps";

export const TEXT_STRONG = "color-mix(in srgb, var(--text-primary) 87%, transparent)";
export const TEXT_MUTED = "color-mix(in srgb, var(--text-primary) 33%, transparent)";

export const fieldRowStyle: CSSProperties = {
  minHeight: 50,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 14,
  padding: "10px 12px",
  borderBottom: "1px solid var(--control-border-soft)",
};

export const iconActionStyle: CSSProperties = {
  width: 28,
  height: 28,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 8,
  border: "1px solid var(--control-border)",
  background: "var(--control-bg)",
  color: "var(--text-secondary)",
  cursor: "pointer",
};

export const selectChevronStyle: CSSProperties = {
  position: "absolute",
  right: 10,
  top: "50%",
  transform: "translateY(-50%)",
  color: "color-mix(in srgb, var(--text-primary) 54%, transparent)",
  pointerEvents: "none",
};

export const toggleRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
};

export const smallIconButtonStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 28,
  height: 28,
  borderRadius: 7,
  background: "color-mix(in srgb, var(--text-primary) 3%, transparent)",
  border: "1px solid color-mix(in srgb, var(--text-primary) 6%, transparent)",
  color: "color-mix(in srgb, var(--text-primary) 45%, transparent)",
  cursor: "pointer",
};

const SLIDER_FILL = "color-mix(in srgb, var(--text-primary) 54%, transparent)";

/** Percentage of `value` within [min, max], clamped to 0–100. */
export function sliderPct(value: number, min: number, max: number): number {
  if (max <= min || !Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
}

export function sliderStyle(pct: number): CSSProperties {
  return {
    width: "100%",
    height: 4,
    WebkitAppearance: "none",
    appearance: "none",
    borderRadius: 2,
    background: `linear-gradient(to right, ${SLIDER_FILL} 0%, ${SLIDER_FILL} ${pct}%, var(--control-border) ${pct}%, var(--control-border) 100%)`,
    outline: "none",
    cursor: "pointer",
    accentColor: "var(--text-primary)",
  };
}

/** Upstream-card switch (theme tokens per #230). */
export function glassSwitchStyle(enabled: boolean): CSSProperties {
  return {
    position: "relative",
    flexShrink: 0,
    width: 42,
    height: 23,
    padding: 2,
    border: "1px solid var(--control-border)",
    borderRadius: 999,
    WebkitAppearance: "none",
    appearance: "none",
    background: enabled ? "var(--toggle-on)" : "var(--control-bg)",
    boxShadow: enabled ? "inset 0 0 0 1px var(--control-border-soft)" : "none",
    cursor: "pointer",
    transition: "all .2s",
  };
}

export function glassSwitchKnobStyle(enabled: boolean): CSSProperties {
  return {
    display: "block",
    width: 17,
    height: 17,
    borderRadius: "50%",
    background: "var(--toggle-knob)",
    transform: enabled ? "translateX(17px)" : "translateX(0)",
    transition: "all .2s",
    boxShadow: "var(--shadow-sm)",
  };
}

export interface SettingsStyles {
  input: CSSProperties;
  textarea: CSSProperties;
  sectionLabel: CSSProperties;
  title: CSSProperties;
  description: CSSProperties;
  select: CSSProperties;
  button: CSSProperties;
  smallAction: CSSProperties;
  compactButton: (active?: boolean) => CSSProperties;
}

const stylesCache = new WeakMap<FontScale, SettingsStyles>();

/** Font-scaled styles, cached per `s` identity (stable while font size is). */
export function getSettingsStyles(s: FontScale): SettingsStyles {
  const cached = stylesCache.get(s);
  if (cached) return cached;
  const input: CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    height: 32,
    padding: "0 10px",
    background: "var(--control-bg)",
    border: "1px solid var(--control-border)",
    borderRadius: 7,
    color: "var(--text-primary)",
    fontFamily: "var(--font-mono)",
    fontSize: s(12),
    outline: "none",
  };
  const compactActive: CSSProperties = compactButton(s, true);
  const compactInactive: CSSProperties = compactButton(s, false);
  const styles: SettingsStyles = {
    input,
    textarea: { ...input, minHeight: 84, height: "auto", padding: "8px 10px", resize: "vertical", lineHeight: 1.45 },
    sectionLabel: {
      fontFamily: "var(--font-mono)",
      fontSize: s(10),
      fontWeight: 600,
      color: "color-mix(in srgb, var(--text-primary) 27%, transparent)",
      letterSpacing: ".12em",
      textTransform: "uppercase",
      marginBottom: 20,
      marginTop: 12,
    },
    title: { fontSize: s(13), color: TEXT_STRONG, marginBottom: 2 },
    description: { fontSize: s(11), color: TEXT_MUTED },
    select: {
      width: "100%",
      height: 32,
      padding: "0 28px 0 10px",
      background: "var(--control-bg)",
      border: "1px solid var(--control-border)",
      borderRadius: 7,
      color: "var(--text-primary)",
      fontFamily: "var(--font-ui)",
      fontSize: s(12),
      outline: "none",
      WebkitAppearance: "none",
      MozAppearance: "none",
      appearance: "none",
    },
    button: {
      padding: "6px 14px",
      borderRadius: 7,
      background: "var(--control-bg)",
      border: "1px solid var(--control-border)",
      color: "color-mix(in srgb, var(--text-primary) 82%, transparent)",
      fontSize: s(12),
      cursor: "pointer",
      transition: "all .2s",
      fontFamily: "var(--font-ui)",
    },
    smallAction: {
      height: 28,
      padding: "0 10px",
      borderRadius: 8,
      border: "1px solid var(--control-border)",
      background: "var(--control-bg)",
      color: "var(--text-secondary)",
      cursor: "pointer",
      fontFamily: "var(--font-ui)",
      fontSize: s(11),
    },
    compactButton: (active = true) => (active ? compactActive : compactInactive),
  };
  stylesCache.set(s, styles);
  return styles;
}

function compactButton(s: FontScale, active: boolean): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 12px",
    borderRadius: 7,
    background: active ? "var(--hover-overlay)" : "var(--control-bg)",
    border: "1px solid var(--control-border)",
    color: active
      ? "color-mix(in srgb, var(--text-primary) 78%, transparent)"
      : "color-mix(in srgb, var(--text-primary) 38%, transparent)",
    fontSize: s(12),
    cursor: active ? "pointer" : "not-allowed",
    transition: "all .2s",
    fontFamily: "var(--font-ui)",
  };
}
