/**
 * Theme helpers shared by the sandboxed render blocks (Mermaid, interactive
 * iframes). They read the live document theme; no React.
 */

export type ResolvedThemeMode = "light" | "dark";

/** Window events dispatched when the theme / appearance changes. */
export const THEME_CHANGE_EVENTS = ["rayline:theme-change", "rayline:appearance-change"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Resolved mode from a theme-change event detail, else from the document. */
export function getResolvedThemeMode(detail?: unknown): ResolvedThemeMode {
  if (isRecord(detail)) {
    const candidate = detail.resolved || detail.mode || detail.theme;
    if (candidate === "light" || candidate === "dark") return candidate;
  }

  if (typeof document !== "undefined") {
    const root = document.documentElement;
    if (root.dataset.theme === "light" || root.dataset.theme === "dark") {
      return root.dataset.theme;
    }
    if (root.classList.contains("light")) return "light";
  }

  return "dark";
}

/** `data-theme="light"` or `.light` → light; everything else dark. */
export function getDocumentThemeMode(): ResolvedThemeMode {
  if (typeof document === "undefined") return "dark";
  const root = document.documentElement;
  return root.dataset.theme === "light" || root.classList.contains("light") ? "light" : "dark";
}

export function readRootCssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** Subscribe to theme / appearance changes; returns the unsubscribe function. */
export function subscribeThemeChange(listener: (event: Event) => void): () => void {
  for (const name of THEME_CHANGE_EVENTS) window.addEventListener(name, listener);
  return () => {
    for (const name of THEME_CHANGE_EVENTS) window.removeEventListener(name, listener);
  };
}

/** `event.detail` for CustomEvents, undefined otherwise. */
export function eventDetail(event: Event): unknown {
  return event instanceof CustomEvent ? (event as CustomEvent<unknown>).detail : undefined;
}
