import { useRef, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useFontScale } from "../contexts/FontSizeContext";

export default function InteractiveBlock({ code, isStreaming }) {
  const s = useFontScale();
  const iframeRef = useRef(null);
  const [height, setHeight] = useState(300);
  const [loaded, setLoaded] = useState(false);

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

  // Wrap user code in a full HTML document with dark theme defaults + auto-resize
  const srcdoc = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  *, *::before, *::after { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 12px;
    background: #0a0a0a;
    color: rgba(255,255,255,0.75);
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 14px;
    overflow: hidden;
  }
  svg text { fill: rgba(255,255,255,0.75); }
  svg line, svg path { stroke: rgba(255,255,255,0.15); }
</style>
</head>
<body>
${code}
<script>
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
      <IframeRenderer srcdoc={srcdoc} />
    </div>
  );
}

// Separate component so iframe doesn't re-mount on every parent render
function IframeRenderer({ srcdoc }) {
  const iframeRef = useRef(null);
  const [height, setHeight] = useState(300);

  useEffect(() => {
    const handler = (e) => {
      if (e.data?.type === "iframe-resize" && e.source === iframeRef.current?.contentWindow) {
        setHeight(Math.min(e.data.height + 4, 800));
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  return (
    <iframe
      ref={iframeRef}
      srcDoc={srcdoc}
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
