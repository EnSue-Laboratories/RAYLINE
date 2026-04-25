import { useCallback, useRef, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useFontScale } from "../contexts/FontSizeContext";
import { useResolvedThemeMode } from "../contexts/ThemeContext";

export default function InteractiveBlock({ code, isStreaming }) {
  const s = useFontScale();
  const resolvedMode = useResolvedThemeMode();
  const initialResolvedModeRef = useRef(resolvedMode);
  const srcdoc = useMemo(() => {
    const initialResolvedMode = initialResolvedModeRef.current;
    return `<!DOCTYPE html>
<html data-theme="${initialResolvedMode}">
<head>
<meta charset="utf-8">
<style>
  :root {
    color-scheme: ${initialResolvedMode};
    --bg: ${initialResolvedMode === "light" ? "#ffffff" : "#0a0a0a"};
    --fg: ${initialResolvedMode === "light" ? "rgba(15,23,42,0.78)" : "rgba(255,255,255,0.75)"};
    --line: ${initialResolvedMode === "light" ? "rgba(15,23,42,0.18)" : "rgba(255,255,255,0.15)"};
  }
  :root[data-theme="light"] {
    color-scheme: light;
    --bg: #ffffff;
    --fg: rgba(15,23,42,0.78);
    --line: rgba(15,23,42,0.18);
  }
  :root[data-theme="dark"] {
    color-scheme: dark;
    --bg: #0a0a0a;
    --fg: rgba(255,255,255,0.75);
    --line: rgba(255,255,255,0.15);
  }
  *, *::before, *::after { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 12px;
    background: var(--bg);
    color: var(--fg);
    font-family: system-ui, -apple-system, sans-serif;
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
  function applyTheme(resolved) {
    if (resolved !== 'light' && resolved !== 'dark') return;
    document.documentElement.dataset.theme = resolved;
    postHeight();
  }
  window.addEventListener('message', (event) => {
    if (event.data?.type === 'rayline:theme') {
      applyTheme(event.data.resolved);
    }
  });

  // Auto-resize: post height to parent
  function postHeight() {
    const h = Math.max(document.body.scrollHeight, document.body.offsetHeight, 60);
    window.parent.postMessage({ type: 'iframe-resize', height: h }, '*');
  }
  new ResizeObserver(postHeight).observe(document.body);
  window.addEventListener('load', () => setTimeout(postHeight, 100));
  postHeight();
</script>
</body>
</html>`;
  }, [code]);

  // While streaming, show a generating placeholder
  if (isStreaming) {
    return (
      <div style={{
        margin: "12px 0",
        borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.06)",
        background: "#0a0a0a",
        padding: "24px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        minHeight: 120,
      }}>
        <Loader2
          size={16}
          strokeWidth={1.5}
          style={{
            color: "rgba(255,255,255,0.2)",
            animation: "spin 1s linear infinite",
          }}
        />
        <span style={{
          fontSize: s(9),
          fontFamily: "'JetBrains Mono',monospace",
          color: "rgba(255,255,255,0.2)",
          letterSpacing: ".1em",
        }}>
          GENERATING VISUALIZATION
        </span>
      </div>
    );
  }

  return (
    <div style={{
      margin: "12px 0",
      borderRadius: 10,
      overflow: "hidden",
      border: "1px solid rgba(255,255,255,0.06)",
      background: "#0a0a0a",
      position: "relative",
    }}>
      <div style={{
        fontSize: s(8),
        fontFamily: "'JetBrains Mono',monospace",
        color: "rgba(255,255,255,0.2)",
        letterSpacing: ".1em",
        padding: "6px 10px 0",
      }}>
        INTERACTIVE
      </div>
      <IframeRenderer srcdoc={srcdoc} resolvedMode={resolvedMode} />
    </div>
  );
}

// Separate component so iframe doesn't re-mount on every parent render
function IframeRenderer({ srcdoc, resolvedMode }) {
  const iframeRef = useRef(null);
  const [height, setHeight] = useState(300);
  const postTheme = useCallback(() => {
    iframeRef.current?.contentWindow?.postMessage({ type: "rayline:theme", resolved: resolvedMode }, "*");
  }, [resolvedMode]);

  useEffect(() => {
    const handler = (e) => {
      if (e.data?.type === "iframe-resize" && e.source === iframeRef.current?.contentWindow) {
        setHeight(Math.min(e.data.height + 4, 800));
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  useEffect(() => {
    postTheme();
  }, [postTheme]);

  return (
    <iframe
      ref={iframeRef}
      srcDoc={srcdoc}
      onLoad={postTheme}
      style={{
        width: "100%",
        height,
        border: "none",
        display: "block",
        borderRadius: "0 0 10px 10px",
      }}
      sandbox="allow-scripts allow-same-origin allow-popups"
    />
  );
}
