/**
 * Builds the sandboxed iframe document for ```render``` blocks: theme
 * defaults, a theme-update listener and auto-resize via postMessage.
 */

import { getResolvedThemeMode, readRootCssVar, type ResolvedThemeMode } from "./themeMode";

export interface InteractiveTokens {
  bg: string;
  fg: string;
  line: string;
  fontUi: string;
}

/** Message the iframe posts with its content height. */
export const IFRAME_RESIZE_MESSAGE = "iframe-resize";
/** Message the host posts to retheme the iframe. */
export const IFRAME_THEME_MESSAGE = "rayline:theme";

export function getInteractiveTokens(resolvedMode: ResolvedThemeMode = getResolvedThemeMode()): InteractiveTokens {
  const light = resolvedMode === "light";
  return {
    bg: readRootCssVar("--bg-primary", light ? "#ffffff" : "#0d0d10"),
    fg: readRootCssVar("--text-primary", light ? "rgba(15,23,42,0.78)" : "rgba(255,255,255,0.75)"),
    line: readRootCssVar("--border-strong", light ? "rgba(15,23,42,0.18)" : "rgba(255,255,255,0.15)"),
    fontUi: readRootCssVar("--font-ui", "system-ui, -apple-system, sans-serif"),
  };
}

/** Height reported by an iframe-resize message, or null for other messages. */
export function readIframeResizeHeight(data: unknown): number | null {
  if (typeof data !== "object" || data === null) return null;
  const record = data as Record<string, unknown>;
  if (record.type !== IFRAME_RESIZE_MESSAGE) return null;
  return typeof record.height === "number" && Number.isFinite(record.height) ? record.height : null;
}

/** Iframe height for a reported content height: +4px chrome, capped at 800. */
export function clampIframeHeight(contentHeight: number): number {
  return Math.min(contentHeight + 4, 800);
}

export function buildInteractiveSrcdoc(code: string, resolvedMode: ResolvedThemeMode, tokens: InteractiveTokens): string {
  return `<!DOCTYPE html>
<html data-theme="${resolvedMode}">
<head>
<meta charset="utf-8">
<style>
  :root {
    color-scheme: ${resolvedMode};
    --bg: ${tokens.bg};
    --fg: ${tokens.fg};
    --line: ${tokens.line};
    --font-ui: ${tokens.fontUi};
  }
  :root[data-theme="light"] {
    color-scheme: light;
    --bg: #ffffff;
    --fg: rgba(15,23,42,0.78);
    --line: rgba(15,23,42,0.18);
  }
  :root[data-theme="dark"] {
    color-scheme: dark;
    --bg: #0d0d10;
    --fg: rgba(255,255,255,0.75);
    --line: rgba(255,255,255,0.15);
  }
  *, *::before, *::after { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 12px;
    background: var(--bg);
    color: var(--fg);
    font-family: var(--font-ui);
    font-size: 14px;
    overflow: hidden;
  }
  svg text { fill: var(--fg); }
  svg line, svg path { stroke: var(--line); }
</style>
</head>
<body>
${code}
<script>
  function applyTheme(resolved, tokens) {
    if (resolved !== 'light' && resolved !== 'dark') return;
    document.documentElement.dataset.theme = resolved;
    if (tokens && typeof tokens === 'object') {
      if (tokens.bg) document.documentElement.style.setProperty('--bg', tokens.bg);
      if (tokens.fg) document.documentElement.style.setProperty('--fg', tokens.fg);
      if (tokens.line) document.documentElement.style.setProperty('--line', tokens.line);
      if (tokens.fontUi) document.documentElement.style.setProperty('--font-ui', tokens.fontUi);
    }
    postHeight();
  }
  window.addEventListener('message', (event) => {
    if (event.data?.type === '${IFRAME_THEME_MESSAGE}') {
      applyTheme(event.data.resolved, event.data.tokens);
    }
  });

  // Auto-resize: post height to parent
  function postHeight() {
    const h = Math.max(document.body.scrollHeight, document.body.offsetHeight, 60);
    window.parent.postMessage({ type: '${IFRAME_RESIZE_MESSAGE}', height: h }, '*');
  }
  new ResizeObserver(postHeight).observe(document.body);
  window.addEventListener('load', () => setTimeout(postHeight, 100));
  postHeight();
</script>
</body>
</html>`;
}
