function clampOpacity(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(100, Math.max(0, numeric));
}

function getTheme() {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function alphaFill(alphaPercent) {
  const base = getTheme() === "light" ? "31, 41, 55" : "255, 255, 255";
  return `rgba(${base}, ${(alphaPercent / 100).toFixed(3)})`;
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

export function getPaneSurfaceStyle(hasWallpaper, options = {}) {
  const hoverOpacity = clampOpacity(
    options.hoverOpacity,
    hasWallpaper ? 2 : 0
  );
  const activeOpacity = clampOpacity(
    options.activeOpacity,
    hasWallpaper ? 3.5 : 8
  );
  const hoverFill = hoverOpacity > 0 ? alphaFill(hoverOpacity) : "var(--pane-hover)";
  const activeFill = alphaFill(activeOpacity);

  if (!hasWallpaper) {
    return {
      background: "var(--pane-background)",
      "--pane-interaction-hover": hoverFill,
      "--pane-interaction-active": activeFill,
      "--pane-interaction-hover-fill": hoverFill,
      "--pane-interaction-active-fill": activeFill,
      "--pane-interaction-hover-filter": "none",
      "--pane-interaction-active-filter": "none",
      "--pane-interaction-hover-shadow": "none",
      "--pane-interaction-active-shadow": "none",
    };
  }

  return {
    background: "var(--pane-background-overlay)",
    "--pane-elevated": "var(--pane-elevated)",
    "--pane-hover": hoverFill,
    "--pane-active": activeFill,
    "--pane-border": getTheme() === "light" ? "rgba(41,51,65,0.14)" : "rgba(255,255,255,0.06)",
    "--pane-interaction-hover": hoverFill,
    "--pane-interaction-active": activeFill,
    "--pane-interaction-hover-fill": hoverFill,
    "--pane-interaction-active-fill": activeFill,
    "--pane-interaction-hover-filter": "none",
    "--pane-interaction-active-filter": "none",
    "--pane-interaction-hover-shadow": getTheme() === "light"
      ? "inset 0 0 0 1px rgba(41,51,65,0.06)"
      : "inset 0 0 0 1px rgba(255,255,255,0.035)",
    "--pane-interaction-active-shadow": "none",
  };
}
