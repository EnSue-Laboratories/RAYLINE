import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";
import { useFontScale } from "../contexts/FontSizeContext";

let mermaidInitialized = false;
let renderCounter = 0;

function initMermaid() {
  if (mermaidInitialized) return;
  mermaid.initialize({
    startOnLoad: false,
    theme: "base",
    suppressErrorRendering: true,
    themeVariables: {
      darkMode: true,
      background: "#0a0a0a",
      mainBkg: "#1a1a1a",
      nodeBorder: "rgba(255,255,255,0.25)",
      clusterBkg: "#111111",
      clusterBorder: "rgba(255,255,255,0.15)",
      titleColor: "rgba(255,255,255,0.85)",

      // Text colors
      primaryTextColor: "rgba(255,255,255,0.85)",
      secondaryTextColor: "rgba(255,255,255,0.6)",
      tertiaryTextColor: "rgba(255,255,255,0.5)",

      // Line/edge colors
      lineColor: "rgba(255,255,255,0.35)",
      textColor: "rgba(255,255,255,0.8)",

      // Node colors — soft blues/teals instead of pink
      primaryColor: "#1e3a5f",
      primaryBorderColor: "#3b82c4",
      secondaryColor: "#1a2e3e",
      secondaryBorderColor: "#4a90b8",
      tertiaryColor: "#1e2d3d",
      tertiaryBorderColor: "#5a9ab5",

      // Git graph — white lines, dark text on light labels
      git0: "#ffffff",
      git1: "#aaaaaa",
      git2: "#cccccc",
      git3: "#888888",
      git4: "#dddddd",
      git5: "#bbbbbb",
      git6: "#999999",
      git7: "#eeeeee",
      gitBranchLabel0: "#000000",
      gitBranchLabel1: "#000000",
      gitBranchLabel2: "#000000",
      gitBranchLabel3: "#000000",
      gitBranchLabel4: "#000000",
      gitBranchLabel5: "#000000",
      gitBranchLabel6: "#000000",
      gitBranchLabel7: "#000000",
      gitInv0: "#000000",
      commitLabelColor: "rgba(255,255,255,0.7)",
      commitLabelBackground: "rgba(255,255,255,0.08)",

      // Pie chart
      pie1: "#3b82c4",
      pie2: "#6ab04c",
      pie3: "#e2b93d",
      pie4: "#e07b4c",
      pie5: "#9b59b6",
      pie6: "#1abc9c",
      pie7: "#e67e22",
      pie8: "#2ecc71",
      pieTitleTextColor: "rgba(255,255,255,0.85)",
      pieSectionTextColor: "rgba(255,255,255,0.9)",
      pieLegendTextColor: "rgba(255,255,255,0.7)",
      pieStrokeColor: "rgba(255,255,255,0.1)",
      pieSectionTextSize: "14px",
      pieOuterStrokeColor: "rgba(255,255,255,0.1)",

      // Notes
      noteBkgColor: "#1a2530",
      noteTextColor: "rgba(255,255,255,0.8)",
      noteBorderColor: "rgba(255,255,255,0.15)",

      // Sequence diagram
      actorBkg: "#1a2530",
      actorBorder: "rgba(255,255,255,0.25)",
      actorTextColor: "rgba(255,255,255,0.85)",
      signalColor: "rgba(255,255,255,0.7)",
      labelBoxBkgColor: "#1a2530",

      // Flowchart
      edgeLabelBackground: "#0a0a0a",

      // Class diagram
      classText: "rgba(255,255,255,0.8)",

      // Font
      fontFamily: "system-ui,-apple-system,sans-serif",
      fontSize: "13px",
    },
  });
  mermaidInitialized = true;
}

export default function MermaidBlock({ code }) {
  const s = useFontScale();
  const [svg, setSvg] = useState(null);
  const [error, setError] = useState(false);
  const lastRendered = useRef("");
  const timerRef = useRef(null);
  const containerRef = useRef(null);
  const lastHeight = useRef(null);

  useEffect(() => {
    const trimmed = code?.trim();
    if (!trimmed) return;
    if (trimmed === lastRendered.current && svg) return;

    // Debounce: wait 600ms after last code change (handles streaming)
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      lastRendered.current = trimmed;
      initMermaid();
      setError(false);

      const id = `mmd-${++renderCounter}-${Date.now()}`;
      const offscreen = document.createElement("div");
      offscreen.style.cssText = "position:absolute;left:-9999px;top:-9999px;visibility:hidden;width:800px";
      document.body.appendChild(offscreen);

      mermaid.render(id, trimmed, offscreen).then(({ svg: result }) => {
        setSvg(result);
      }).catch(() => {
        setError(true);
      }).finally(() => {
        try { document.body.removeChild(offscreen); } catch { /* ignore */ }
      });
    }, 600);

    return () => clearTimeout(timerRef.current);
  }, [code, svg]);

  // Capture height when SVG is rendered
  useEffect(() => {
    if (svg && containerRef.current) {
      lastHeight.current = containerRef.current.offsetHeight;
    }
  }, [svg]);

  if (error) {
    return (
      <pre style={{
        background: "rgba(0,0,0,0.4)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 8,
        padding: "12px 14px",
        overflow: "auto",
        fontSize: s(12),
        fontFamily: "'JetBrains Mono',monospace",
        margin: "8px 0 12px",
        lineHeight: 1.6,
        color: "rgba(255,255,255,0.5)",
      }}>
        <code>{code}</code>
      </pre>
    );
  }

  if (!svg) {
    return (
      <div style={{
        background: "rgba(0,0,0,0.2)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 8,
        padding: "24px",
        margin: "8px 0 12px",
        textAlign: "center",
        color: "rgba(255,255,255,0.25)",
        fontSize: s(11),
        fontFamily: "'JetBrains Mono',monospace",
        // Preserve last known height to prevent scroll jumps
        minHeight: lastHeight.current || undefined,
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
        background: "rgba(0,0,0,0.2)",
        border: "1px solid rgba(255,255,255,0.06)",
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
