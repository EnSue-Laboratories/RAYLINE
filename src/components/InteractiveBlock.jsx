import { useRef, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useFontScale } from "../contexts/FontSizeContext";

function getResolvedThemeMode(detail) {
  const candidate = detail?.resolved || detail?.mode || detail?.theme;
  if (candidate === "light" || candidate === "dark") return candidate;

  if (typeof document !== "undefined") {
    const root = document.documentElement;
    if (root.dataset.theme === "light" || root.dataset.theme === "dark") {
      return root.dataset.theme;
    }
    if (root.classList.contains("light")) return "light";
  }

  return "dark";
}

function readRootCssVar(name, fallback) {
  if (typeof document === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function getInteractiveTokens(resolvedMode = getResolvedThemeMode()) {
  const light = resolvedMode === "light";
  return {
    bg: readRootCssVar("--bg-primary", light ? "#ffffff" : "#0d0d10"),
    fg: readRootCssVar("--text-primary", light ? "rgba(15,23,42,0.78)" : "rgba(255,255,255,0.75)"),
    line: readRootCssVar("--border-strong", light ? "rgba(15,23,42,0.18)" : "rgba(255,255,255,0.15)"),
    fontUi: readRootCssVar("--font-ui", "system-ui, -apple-system, sans-serif"),
  };
}

export default function InteractiveBlock({ code, isStreaming }) {
  const s = useFontScale();
  const [resolvedMode] = useState(() => getResolvedThemeMode());
  const tokens = getInteractiveTokens(resolvedMode);

  // While streaming, show a generating placeholder
  if (isStreaming) {
    return (
      <div style={{
        margin: "12px 0",
        borderRadius: 10,
        border: "1px solid var(--code-border)",
        background: "var(--code-bg)",
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
            color: "var(--text-disabled)",
            animation: "spin 1s linear infinite",
          }}
        />
        <span style={{
          fontSize: s(9),
          fontFamily: "var(--font-mono)",
          color: "var(--text-disabled)",
          letterSpacing: ".1em",
        }}>
          GENERATING VISUALIZATION
        </span>
      </div>
    );
  }

  // Wrap user code in a full HTML document with theme defaults + auto-resize
  const srcdoc = `<!DOCTYPE html>
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
    if (event.data?.type === 'rayline:theme') {
      applyTheme(event.data.resolved, event.data.tokens);
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

  return (
    <div style={{
      margin: "12px 0",
      borderRadius: 10,
      overflow: "hidden",
      border: "1px solid var(--code-border)",
      background: "var(--code-bg)",
      position: "relative",
    }}>
      <div style={{
        fontSize: s(8),
        fontFamily: "var(--font-mono)",
        color: "var(--text-disabled)",
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

  useEffect(() => {
    const handleThemeChange = (event) => {
      const resolved = getResolvedThemeMode(event.detail);
      iframeRef.current?.contentWindow?.postMessage({ type: "rayline:theme", resolved, tokens: getInteractiveTokens(resolved) }, "*");
    };

    window.addEventListener("rayline:theme-change", handleThemeChange);
    window.addEventListener("rayline:appearance-change", handleThemeChange);
    return () => {
      window.removeEventListener("rayline:theme-change", handleThemeChange);
      window.removeEventListener("rayline:appearance-change", handleThemeChange);
    };
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
