import { memo, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useFontScale } from "../contexts/FontSizeContext";
import {
  getMermaidHeight,
  getMermaidThemeEpoch,
  mermaidCacheKey,
  peekMermaidSvg,
  rememberMermaidHeight,
  renderMermaidSvg,
  subscribeMermaidTheme,
} from "./blocks/mermaidRenderer";
import { getDocumentThemeMode } from "./blocks/themeMode";

/** Wait this long after the last code change before rendering (streaming). */
const RENDER_DEBOUNCE_MS = 600;

export interface MermaidBlockProps {
  code: string;
}

interface RenderState {
  /** Last successfully rendered SVG (kept while a newer version renders). */
  svg: string | null;
  /** Cache key whose render failed; shows the source instead. */
  failedKey: string | null;
}

const INITIAL_STATE: RenderState = { svg: null, failedKey: null };

function MermaidBlock({ code }: MermaidBlockProps) {
  const s = useFontScale();
  const epoch = useSyncExternalStore(subscribeMermaidTheme, getMermaidThemeEpoch);
  const trimmed = code.trim();
  const mode = getDocumentThemeMode();
  const key = mermaidCacheKey(trimmed, mode, epoch);
  // A cached SVG for exactly this code+theme renders synchronously, so a
  // remount (stream end, list re-key, conversation switch) never flashes.
  const cachedSvg = trimmed ? peekMermaidSvg(key) : undefined;
  const [state, setState] = useState<RenderState>(INITIAL_STATE);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!trimmed || peekMermaidSvg(key) !== undefined) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      renderMermaidSvg(trimmed).then(({ svg }) => {
        if (!cancelled) setState({ svg, failedKey: null });
      }).catch(() => {
        if (!cancelled) setState((prev) => ({ ...prev, failedKey: key }));
      });
    }, RENDER_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [key, trimmed]);

  const svg = cachedSvg ?? state.svg;

  // Remember the rendered height so a later placeholder keeps the layout.
  useEffect(() => {
    if (svg && containerRef.current) rememberMermaidHeight(trimmed, containerRef.current.offsetHeight);
  }, [svg, trimmed]);

  if (state.failedKey === key && cachedSvg === undefined) {
    return (
      <pre style={{
        background: "var(--mermaid-bg)",
        border: "1px solid var(--mermaid-node-border)",
        borderRadius: 8,
        padding: "12px 14px",
        overflow: "auto",
        fontSize: s(12),
        fontFamily: "var(--font-mono)",
        margin: "8px 0 12px",
        lineHeight: 1.6,
        color: "var(--mermaid-text)",
      }}>
        <code>{code}</code>
      </pre>
    );
  }

  if (!svg) {
    return (
      <div style={{
        background: "var(--mermaid-bg)",
        border: "1px solid var(--mermaid-node-border)",
        borderRadius: 8,
        padding: "24px",
        margin: "8px 0 12px",
        textAlign: "center",
        color: "var(--mermaid-text)",
        fontSize: s(11),
        fontFamily: "var(--font-mono)",
        // Preserve last known height to prevent scroll jumps
        minHeight: getMermaidHeight(trimmed),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        Rendering diagram...
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        background: "var(--mermaid-bg)",
        border: "1px solid var(--mermaid-node-border)",
        borderRadius: 8,
        padding: "16px",
        margin: "8px 0 12px",
        overflowX: "auto",
        overflowY: "hidden",
        textAlign: "center",
      }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export default memo(MermaidBlock);
