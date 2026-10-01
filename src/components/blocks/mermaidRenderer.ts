/**
 * Lazy Mermaid runtime + SVG cache shared by every MermaidBlock.
 *
 *  - `mermaid` (~560 KB with d3/dagre/rough) is loaded with a dynamic
 *    `import()` the first time a diagram renders, through one memoized
 *    promise, so it is no longer part of the startup bundle.
 *  - `mermaid.initialize` runs once per (theme mode, theme epoch).
 *  - Rendered SVGs are cached by (epoch, mode, code) so a block that
 *    remounts (stream end swaps the markdown components, list re-keys,
 *    conversation switches) shows its diagram immediately instead of
 *    flashing "Rendering diagram..." and re-running layout.
 *  - Any theme / appearance change bumps the epoch, which invalidates the
 *    cache and forces re-initialization. Components subscribe to the epoch
 *    through `subscribeMermaidTheme` / `getMermaidThemeEpoch`
 *    (useSyncExternalStore).
 */

import type { Mermaid } from "mermaid";
import { getMermaidThemeVariables } from "./mermaidTheme";
import { getDocumentThemeMode, subscribeThemeChange, type ResolvedThemeMode } from "./themeMode";

const SVG_CACHE_LIMIT = 64;

let mermaidPromise: Promise<Mermaid> | null = null;
let initializedFor: string | null = null;
let renderCounter = 0;
let themeEpoch = 0;
let themeUnsubscribe: (() => void) | null = null;
const epochListeners = new Set<() => void>();

/** key → svg, in insertion (≈ LRU) order. */
const svgCache = new Map<string, string>();
/** code → last measured container height (placeholder min-height). */
const heightCache = new Map<string, number>();

function loadMermaid(): Promise<Mermaid> {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then(
      (mod) => mod.default,
      (error: unknown) => {
        // Allow a later block to retry (e.g. transient chunk-load failure).
        mermaidPromise = null;
        throw error;
      },
    );
  }
  return mermaidPromise;
}

/** Start fetching the Mermaid chunk without rendering anything. */
export function preloadMermaid(): void {
  void loadMermaid().catch(() => undefined);
}

function handleThemeChange(): void {
  themeEpoch += 1;
  initializedFor = null;
  svgCache.clear();
  for (const listener of epochListeners) listener();
}

/**
 * Subscribe to theme epochs. The window listener stays attached once
 * installed so the cache is invalidated even while no diagram is mounted.
 */
export function subscribeMermaidTheme(listener: () => void): () => void {
  themeUnsubscribe ??= subscribeThemeChange(handleThemeChange);
  epochListeners.add(listener);
  return () => {
    epochListeners.delete(listener);
  };
}

export function getMermaidThemeEpoch(): number {
  return themeEpoch;
}

export function mermaidCacheKey(code: string, mode: ResolvedThemeMode, epoch: number): string {
  return `${epoch}\u0000${mode}\u0000${code}`;
}

export function peekMermaidSvg(key: string): string | undefined {
  return svgCache.get(key);
}

function rememberSvg(key: string, svg: string): void {
  svgCache.delete(key);
  svgCache.set(key, svg);
  while (svgCache.size > SVG_CACHE_LIMIT) {
    const oldest = svgCache.keys().next().value;
    if (oldest === undefined) break;
    svgCache.delete(oldest);
  }
}

export function getMermaidHeight(code: string): number | undefined {
  return heightCache.get(code);
}

export function rememberMermaidHeight(code: string, height: number): void {
  if (!(height > 0)) return;
  heightCache.delete(code);
  heightCache.set(code, height);
  while (heightCache.size > SVG_CACHE_LIMIT) {
    const oldest = heightCache.keys().next().value;
    if (oldest === undefined) break;
    heightCache.delete(oldest);
  }
}

function ensureInitialized(mermaid: Mermaid, mode: ResolvedThemeMode): void {
  const signature = `${themeEpoch}:${mode}`;
  if (initializedFor === signature) return;
  mermaid.initialize({
    startOnLoad: false,
    theme: "base",
    suppressErrorRendering: true,
    themeVariables: getMermaidThemeVariables(mode),
  });
  initializedFor = signature;
}

/**
 * Render `code` for the current document theme. Resolves to the SVG string
 * (cached under the returned key) or rejects when Mermaid can't parse it.
 */
export async function renderMermaidSvg(code: string): Promise<{ key: string; svg: string }> {
  const mermaid = await loadMermaid();
  const mode = getDocumentThemeMode();
  const key = mermaidCacheKey(code, mode, themeEpoch);
  const cached = svgCache.get(key);
  if (cached !== undefined) return { key, svg: cached };

  ensureInitialized(mermaid, mode);
  const id = `mmd-${++renderCounter}-${Date.now()}`;
  const offscreen = document.createElement("div");
  offscreen.style.cssText = "position:absolute;left:-9999px;top:-9999px;visibility:hidden;width:800px";
  document.body.appendChild(offscreen);
  try {
    const { svg } = await mermaid.render(id, code, offscreen);
    rememberSvg(key, svg);
    return { key, svg };
  } finally {
    offscreen.remove();
  }
}
