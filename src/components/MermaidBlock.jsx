import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

let mermaidInitialized = false;
let renderCounter = 0;

function initMermaid() {
  if (mermaidInitialized) return;
  mermaid.initialize({
    startOnLoad: false,
    theme: "dark",
    suppressErrorRendering: true,
    themeVariables: {
      darkMode: true,
      background: "transparent",
      primaryColor: "rgba(140,180,255,0.15)",
      primaryTextColor: "rgba(255,255,255,0.8)",
      primaryBorderColor: "rgba(255,255,255,0.2)",
      lineColor: "rgba(255,255,255,0.3)",
      secondaryColor: "rgba(255,255,255,0.05)",
      tertiaryColor: "rgba(255,255,255,0.03)",
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

    // Render in a hidden off-screen container to avoid layout thrashing
    const offscreen = document.createElement("div");
    offscreen.style.position = "absolute";
    offscreen.style.left = "-9999px";
    offscreen.style.top = "-9999px";
    offscreen.style.visibility = "hidden";
    document.body.appendChild(offscreen);

    mermaid.render(id, code.trim(), offscreen).then(({ svg: result }) => {
      setSvg(result);
    }).catch(() => {
      setError(true);
    }).finally(() => {
      // Clean up offscreen container
      try { document.body.removeChild(offscreen); } catch {}
    });
  }, [code]);

  if (error) {
    // Fallback: show as plain code
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
