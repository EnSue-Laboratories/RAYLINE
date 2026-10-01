import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useFontScale } from "../contexts/FontSizeContext";
import {
  IFRAME_THEME_MESSAGE,
  buildInteractiveSrcdoc,
  clampIframeHeight,
  getInteractiveTokens,
  readIframeResizeHeight,
} from "./blocks/interactiveDoc";
import { eventDetail, getResolvedThemeMode, subscribeThemeChange } from "./blocks/themeMode";

export interface InteractiveBlockProps {
  /** Raw HTML/SVG/JS body of the ```render``` fence. */
  code: string;
  isStreaming?: boolean;
}

function InteractiveBlock({ code, isStreaming = false }: InteractiveBlockProps) {
  const s = useFontScale();
  const [resolvedMode] = useState(() => getResolvedThemeMode());
  // Building the document reads four computed CSS variables (forces a style
  // recalc); only redo it when the code itself changes.
  const srcdoc = useMemo(
    () => (isStreaming ? "" : buildInteractiveSrcdoc(code, resolvedMode, getInteractiveTokens(resolvedMode))),
    [code, isStreaming, resolvedMode],
  );

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

interface IframeRendererProps {
  srcdoc: string;
}

// Separate memoized component so the iframe doesn't reload on parent renders.
const IframeRenderer = memo(function IframeRenderer({ srcdoc }: IframeRendererProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [height, setHeight] = useState(300);

  useEffect(() => {
    const handler = (e: MessageEvent<unknown>) => {
      if (e.source !== iframeRef.current?.contentWindow) return;
      const reported = readIframeResizeHeight(e.data);
      if (reported !== null) setHeight(clampIframeHeight(reported));
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  useEffect(() => subscribeThemeChange((event) => {
    const resolved = getResolvedThemeMode(eventDetail(event));
    iframeRef.current?.contentWindow?.postMessage(
      { type: IFRAME_THEME_MESSAGE, resolved, tokens: getInteractiveTokens(resolved) },
      "*",
    );
  }), []);

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
});

export default memo(InteractiveBlock);
