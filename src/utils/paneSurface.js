function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

const INTERACTION_STYLES = {
  idle: {
    background: "transparent",
    backdropFilter: "none",
    boxShadow: "none",
  },
  hover: {
    background: "var(--pane-interaction-hover-fill, var(--pane-interaction-hover, var(--pane-hover)))",
    backdropFilter: "var(--pane-interaction-hover-filter, none)",
    boxShadow: "var(--pane-interaction-hover-shadow, none)",
  },
  active: {
    background: "var(--pane-interaction-active-fill, var(--pane-interaction-active, var(--pane-active)))",
    backdropFilter: "var(--pane-interaction-active-filter, none)",
    boxShadow: "var(--pane-interaction-active-shadow, none)",
  },
};

export function getPaneInteractionStyle(state) {
  return INTERACTION_STYLES[state] || INTERACTION_STYLES.idle;
}

export function applyPaneInteractionStyle(element, state) {
  const style = getPaneInteractionStyle(state);
  element.style.background = style.background;
  element.style.backdropFilter = style.backdropFilter;
  element.style.boxShadow = style.boxShadow;
}

export function getPaneSurfaceStyle(hasWallpaper, opacity) {
  if (!hasWallpaper) {
    return {
      background: "var(--pane-background)",
      "--pane-interaction-hover": "var(--pane-hover)",
      "--pane-interaction-active": "var(--pane-active)",
      "--pane-interaction-hover-fill": "var(--pane-hover)",
      "--pane-interaction-active-fill": "var(--pane-active)",
      "--pane-interaction-hover-filter": "none",
      "--pane-interaction-active-filter": "none",
      "--pane-interaction-hover-shadow": "none",
      "--pane-interaction-active-shadow": "none",
    };
  }

  const alpha = clamp((Number(opacity) || 0) / 100, 0, 1);
  const hoverFillAlpha = clamp(alpha * 0.06, 0.025, 0.07);
  const activeFillAlpha = clamp(alpha * 0.07, 0.035, 0.085);
  const hoverRingAlpha = clamp(alpha * 0.07, 0.03, 0.09);
  const elevatedAlpha = clamp(alpha * 0.55, 0.28, 0.55);
  const borderAlpha = clamp(alpha * 0.12, 0.06, 0.14);

  const hoverFill = `rgba(255, 255, 255, ${hoverFillAlpha.toFixed(3)})`;
  const activeFill = `rgba(255, 255, 255, ${activeFillAlpha.toFixed(3)})`;

  return {
    background: "var(--pane-background-overlay)",
    "--pane-overlay-alpha": String(alpha),
    "--pane-elevated": `rgba(18, 18, 22, ${elevatedAlpha.toFixed(3)})`,
    "--pane-hover": hoverFill,
    "--pane-active": activeFill,
    "--pane-border": `rgba(255, 255, 255, ${borderAlpha.toFixed(3)})`,
    "--pane-interaction-hover": hoverFill,
    "--pane-interaction-active": activeFill,
    "--pane-interaction-hover-fill": hoverFill,
    "--pane-interaction-active-fill": activeFill,
    "--pane-interaction-hover-filter": "none",
    "--pane-interaction-active-filter": "none",
    "--pane-interaction-hover-shadow": `inset 0 0 0 1px rgba(255,255,255,${hoverRingAlpha.toFixed(3)})`,
    "--pane-interaction-active-shadow": "none",
  };
}
