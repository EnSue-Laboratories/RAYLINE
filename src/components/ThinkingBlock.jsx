import { useState, useRef, useEffect } from "react";
import { ChevronRight, Loader2, Check } from "lucide-react";
import { useFontScale } from "../contexts/FontSizeContext";

export default function ThinkingBlock({ text, isThinking }) {
  const [open, setOpen] = useState(false);
  const s = useFontScale();
  const hasText = Boolean(text && text.trim().length > 0);
  const startTime = useRef(Date.now());
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

  // Freeze elapsed when thinking stops
  const finalElapsed = useRef(0);
  useEffect(() => {
    if (!isThinking && elapsed > 0) {
      finalElapsed.current = elapsed;
    }
  }, [isThinking, elapsed]);

  const seconds = isThinking ? elapsed : (finalElapsed.current || elapsed);

  function formatDuration(s) {
    if (s < 1) return "";
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
  }

  const duration = formatDuration(seconds);

  if (!hasText && !isThinking) {
    if (!duration) return null;
    return (
      <div style={{
        margin: "6px 0 10px",
        borderRadius: 8,
        border: "1px solid var(--control-border)",
        background: "rgba(255,255,255,0.015)",
        padding: "8px 10px",
        display: "flex",
        alignItems: "center",
        gap: 6,
        color: "rgba(255,255,255,0.25)",
        fontSize: s(11),
        fontFamily: "'JetBrains Mono',monospace",
        letterSpacing: ".04em",
      }}>
        Thought for {duration}
      </div>
    );
  }

  const summary = isThinking
    ? (duration ? `Thinking for ${duration}...` : "Thinking...")
    : `Thought for ${duration || "a moment"}`;

  return (
    <div style={{
      margin: "6px 0 10px",
      borderRadius: 8,
      border: "1px solid var(--control-border)",
      background: "rgba(255,255,255,0.015)",
      overflow: "hidden",
    }}>
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
          color: "rgba(255,255,255,0.3)",
          fontSize: s(11),
          fontFamily: "'JetBrains Mono',monospace",
          letterSpacing: ".04em",
          transition: "color .15s",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.5)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.3)"; }}
      >
        {isThinking ? (
          <Loader2 size={12} strokeWidth={1.5} style={{ animation: "spin 1s linear infinite" }} />
        ) : (
          <Check size={12} strokeWidth={1.5} />
        )}
        <span style={{ flex: 1, textAlign: "left" }}>{summary}</span>
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
          fontFamily: "'JetBrains Mono',monospace",
          color: "rgba(255,255,255,0.25)",
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
