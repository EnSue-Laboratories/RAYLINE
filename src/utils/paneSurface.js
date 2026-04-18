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

export function getPaneSurfaceStyle(hasWallpaper) {
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

  return {
    background: "var(--pane-background-overlay)",
    "--pane-elevated": "var(--pane-elevated)",
    "--pane-hover": "rgba(255, 255, 255, 0.03)",
    "--pane-active": "rgba(255, 255, 255, 0.045)",
    "--pane-border": "rgba(255, 255, 255, 0.06)",
    "--pane-interaction-hover": "rgba(255, 255, 255, 0.03)",
    "--pane-interaction-active": "rgba(255, 255, 255, 0.045)",
    "--pane-interaction-hover-fill": "rgba(255, 255, 255, 0.03)",
    "--pane-interaction-active-fill": "rgba(255, 255, 255, 0.045)",
    "--pane-interaction-hover-filter": "none",
    "--pane-interaction-active-filter": "none",
    "--pane-interaction-hover-shadow": "inset 0 0 0 1px rgba(255,255,255,0.045)",
    "--pane-interaction-active-shadow": "none",
  };
}
