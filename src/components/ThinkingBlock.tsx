import { memo, useEffect, useRef, useState, type CSSProperties } from "react";
import { ChevronRight, Loader2, Check } from "lucide-react";
import { useFontScale } from "../contexts/FontSizeContext";
import { formatThinkingDuration, resolveThinkingSeconds, thinkingSummary } from "./blocks/thinking";

export interface ThinkingBlockProps {
  text?: string;
  isThinking?: boolean;
  /** Reported thinking duration (OpenCode); otherwise a live ticker is used. */
  durationMs?: number;
}

const CARD_STYLE: CSSProperties = {
  margin: "6px 0 10px",
  borderRadius: 8,
  border: "1px solid var(--control-border)",
  background: "var(--control-bg-subtle)",
};

function ThinkingBlock({ text, isThinking = false, durationMs }: ThinkingBlockProps) {
  const [open, setOpen] = useState(false);
  const s = useFontScale();
  const hasText = Boolean(text && text.trim().length > 0);
  const startTime = useRef(0);
  const [elapsed, setElapsed] = useState(0);

  // Track thinking duration
  useEffect(() => {
    if (!isThinking) return;
    startTime.current = Date.now();
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [isThinking]);

  const duration = formatThinkingDuration(resolveThinkingSeconds(isThinking, elapsed, durationMs));

  if (!hasText && !isThinking) {
    if (!duration) return null;
    return (
      <div style={{
        ...CARD_STYLE,
        padding: "8px 10px",
        display: "flex",
        alignItems: "center",
        gap: 6,
        color: "var(--text-muted)",
        fontSize: s(11),
        fontFamily: "var(--font-mono)",
        letterSpacing: ".04em",
      }}>
        Thought for {duration}
      </div>
    );
  }

  return (
    <div style={{ ...CARD_STYLE, overflow: "hidden" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          width: "100%",
          padding: "8px 10px",
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--text-muted)",
          fontSize: s(11),
          fontFamily: "var(--font-mono)",
          letterSpacing: ".04em",
          transition: "color .15s",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
      >
        {isThinking ? (
          <Loader2 size={12} strokeWidth={1.5} style={{ animation: "spin 1s linear infinite" }} />
        ) : (
          <Check size={12} strokeWidth={1.5} />
        )}
        <span style={{ flex: 1, textAlign: "left" }}>{thinkingSummary(isThinking, duration)}</span>
        <ChevronRight
          size={12}
          strokeWidth={1.5}
          style={{
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform .15s ease",
          }}
        />
      </button>

      {open && hasText && (
        <div style={{
          padding: "0 12px 10px",
          fontSize: s(12),
          lineHeight: 1.6,
          fontFamily: "var(--font-mono)",
          color: "var(--text-muted)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          maxHeight: 300,
          overflowY: "auto",
        }}>
          {text}
        </div>
      )}
    </div>
  );
}

export default memo(ThinkingBlock);
