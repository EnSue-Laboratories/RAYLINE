import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

let mermaidInitialized = false;

function initMermaid() {
  if (mermaidInitialized) return;
  mermaid.initialize({
    startOnLoad: false,
    theme: "dark",
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
      noteBkgColor: "rgba(255,255,255,0.06)",
      noteTextColor: "rgba(255,255,255,0.7)",
      noteBorderColor: "rgba(255,255,255,0.1)",
    },
  });
  mermaidInitialized = true;
}

let renderCounter = 0;

export default function MermaidBlock({ code }) {
  const containerRef = useRef(null);
  const [svg, setSvg] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!code?.trim()) return;
    initMermaid();

    const id = `mermaid-${++renderCounter}`;
    let cancelled = false;

    mermaid.render(id, code.trim()).then(({ svg: rendered }) => {
      if (!cancelled) setSvg(rendered);
    }).catch((err) => {
      if (!cancelled) setError(err?.message || "Failed to render diagram");
    });

    return () => { cancelled = true; };
  }, [code]);

  if (error) {
    return (
      <pre style={{
        background: "rgba(0,0,0,0.4)",
        border: "1px solid rgba(200,80,80,0.2)",
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
      ref={containerRef}
      style={{
        background: "rgba(0,0,0,0.2)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 8,
        padding: "16px",
        margin: "8px 0 12px",
        overflow: "auto",
        textAlign: "center",
      }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
