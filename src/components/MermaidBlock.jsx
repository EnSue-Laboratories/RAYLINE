import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

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

      // Git graph — white/gray monochrome
      git0: "#ffffff",
      git1: "#bbbbbb",
      git2: "#888888",
      git3: "#cccccc",
      git4: "#aaaaaa",
      git5: "#dddddd",
      git6: "#999999",
      git7: "#eeeeee",
      gitBranchLabel0: "#ffffff",
      gitBranchLabel1: "#bbbbbb",
      gitBranchLabel2: "#888888",
      gitInv0: "#000000",

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
  const [svg, setSvg] = useState(null);
  const [error, setError] = useState(false);
  const rendered = useRef(false);

  useEffect(() => {
    if (!code?.trim() || rendered.current) return;
    rendered.current = true;
    initMermaid();

    const id = `mmd-${++renderCounter}-${Date.now()}`;

    const offscreen = document.createElement("div");
    offscreen.style.cssText = "position:absolute;left:-9999px;top:-9999px;visibility:hidden;width:800px";
    document.body.appendChild(offscreen);

    mermaid.render(id, code.trim(), offscreen).then(({ svg: result }) => {
      setSvg(result);
    }).catch(() => {
      setError(true);
    }).finally(() => {
      try { document.body.removeChild(offscreen); } catch {}
    });
  }, [code]);

  if (error) {
    return (
      <pre style={{
        background: "rgba(0,0,0,0.4)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 8,
        padding: "12px 14px",
        overflow: "auto",
        fontSize: 12,
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
        fontSize: 11,
        fontFamily: "'JetBrains Mono',monospace",
      }}>
        Rendering diagram...
      </div>
    );
  }

  return (
    <div
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
