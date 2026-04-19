import { useEffect, useRef, useState } from "react";
import { useFontScale } from "../contexts/FontSizeContext";

// Hard-coded rotating status phrases — cycles while the agent is working.
const PHRASES = [
  "Thinking",
  "Pondering",
  "Wrangling context",
  "Connecting dots",
  "Cross-referencing",
  "Weighing options",
  "Drafting",
  "Composing",
  "Tracing logic",
  "Synthesizing",
];

// Context window size in tokens. Claude Sonnet/Opus default to 200k.
const CONTEXT_WINDOW = 200_000;

const PHRASE_INTERVAL_MS = 2400;

// Muted spinner ink — keeps the logo's slash+dot geometry but drops the red
// accent so the indicator stays quiet in the message vibe.
const SPINNER_INK = "rgba(255,255,255,0.55)";

function formatCompact(n) {
  if (!n && n !== 0) return "0";
  if (n < 1000) return String(n);
  if (n < 1_000_000) {
    const v = n / 1000;
    return (v >= 100 ? v.toFixed(0) : v.toFixed(1)) + "k";
  }
  const v = n / 1_000_000;
  return (v >= 100 ? v.toFixed(0) : v.toFixed(1)) + "M";
}

function formatDuration(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

// Slash+dot spinner — keeps the RayLine logo's "/•" geometry but in a muted
// whitish ink so it doesn't clash with the message ambiance. Both elements
// pulse out of phase to keep a live feel while staying quiet.
function SlashSpinner() {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        flexShrink: 0,
        width: 16,
        height: 14,
      }}
      aria-hidden="true"
    >
      <svg
        width="16"
        height="14"
        viewBox="0 0 16 14"
        style={{ overflow: "visible" }}
      >
        {/* Slash — same angle as the logo (upper-right to lower-left). */}
        <line
          x1="8"
          y1="1.5"
          x2="2"
          y2="12.5"
          stroke={SPINNER_INK}
          strokeWidth="2"
          strokeLinecap="square"
          style={{ animation: "slashPulse 1.4s ease-in-out infinite" }}
        />
        {/* Dot — trailing accent that echoes the logo's period. */}
        <circle
          cx="13"
          cy="11.5"
          r="1.5"
          fill={SPINNER_INK}
          style={{
            animation: "slashDot 1.4s ease-in-out 0.35s infinite",
            transformOrigin: "center",
            transformBox: "fill-box",
          }}
        />
      </svg>
    </span>
  );
}

export default function LoadingStatus({ startedAt, elapsedMs: frozenElapsedMs, usage, isStreaming }) {
  const s = useFontScale();
  const [now, setNow] = useState(() => Date.now());
  const [phraseIdx, setPhraseIdx] = useState(0);
  const phraseRef = useRef(0);
  const finalElapsedRef = useRef(null);

  useEffect(() => {
    if (!isStreaming) return;
    const tick = setInterval(() => setNow(Date.now()), 250);
    const cycle = setInterval(() => {
      phraseRef.current = (phraseRef.current + 1) % PHRASES.length;
      setPhraseIdx(phraseRef.current);
    }, PHRASE_INTERVAL_MS);
    return () => {
      clearInterval(tick);
      clearInterval(cycle);
    };
  }, [isStreaming]);

  // Freeze elapsed at stream end (same mount) so the footer shows total runtime.
  useEffect(() => {
    if (!isStreaming && startedAt && finalElapsedRef.current == null) {
      finalElapsedRef.current = Date.now() - startedAt;
    }
  }, [isStreaming, startedAt]);

  // Prefer a persisted elapsed value from the message itself — this survives
  // reloads, whereas `Date.now() - _startedAt` would drift across sessions.
  const elapsedMs = isStreaming
    ? (startedAt ? now - startedAt : 0)
    : (frozenElapsedMs ?? finalElapsedRef.current ?? 0);

  const inputTokens = usage?.input_tokens || 0;
  const outputTokens = usage?.output_tokens || 0;
  const cacheRead = usage?.cache_read_input_tokens || 0;
  const cacheCreate = usage?.cache_creation_input_tokens || 0;
  const contextUsed = inputTokens + cacheRead + cacheCreate + outputTokens;
  const contextPct = contextUsed
    ? Math.max(0, Math.min(100, (contextUsed / CONTEXT_WINDOW) * 100))
    : 0;

  const hasUsage = contextUsed > 0;

  // Nothing to say after completion if we never captured any stats.
  if (!isStreaming && !hasUsage && !startedAt && frozenElapsedMs == null) return null;

  const elapsedLabel = formatDuration(elapsedMs);
  const pctLabel = contextPct.toFixed(contextPct >= 10 || contextPct === 0 ? 0 : 1) + "%";

  const primary = isStreaming ? PHRASES[phraseIdx] : "Done";
  const primaryColor = isStreaming ? "rgba(255,255,255,0.72)" : "rgba(255,255,255,0.38)";
  const secondaryColor = "rgba(255,255,255,0.32)";
  // Stat separator — subtle skewed slash glyph in neutral dim.
  const sep = (
    <span
      aria-hidden="true"
      style={{
        color: "rgba(255,255,255,0.22)",
        margin: "0 6px",
        transform: "skewX(-18deg)",
        display: "inline-block",
      }}
    >
      /
    </span>
  );

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        margin: "6px 0 2px",
        display: "flex",
        flexDirection: "column",
        gap: 2,
        fontFamily: "'JetBrains Mono',monospace",
        fontSize: s(11),
        letterSpacing: ".02em",
        lineHeight: 1.55,
      }}
    >
      <style>{`
        @keyframes slashPulse {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.35; }
        }
        @keyframes slashDot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.35; transform: scale(0.7); }
        }
      `}</style>
      {/* Line 1: slash spinner + phrase + elapsed */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {isStreaming && <SlashSpinner />}
        <span style={{ color: primaryColor }}>
          {primary}
          {isStreaming && (
            <span style={{ color: "rgba(255,255,255,0.35)", marginLeft: 2 }}>…</span>
          )}
        </span>
        <span style={{ color: secondaryColor, fontVariantNumeric: "tabular-nums" }}>
          {elapsedLabel}
        </span>
      </div>

      {/* Line 2: token breakdown + context */}
      {hasUsage && (
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", color: secondaryColor, fontVariantNumeric: "tabular-nums" }}>
          <span>
            <span style={{ color: "rgba(255,255,255,0.22)" }}>in </span>
            {formatCompact(inputTokens)}
          </span>
          {sep}
          <span>
            <span style={{ color: "rgba(255,255,255,0.22)" }}>out </span>
            {formatCompact(outputTokens)}
          </span>
          {(cacheRead + cacheCreate) > 0 && (
            <>
              {sep}
              <span>
                <span style={{ color: "rgba(255,255,255,0.22)" }}>cached </span>
                {formatCompact(cacheRead + cacheCreate)}
              </span>
            </>
          )}
          {sep}
          <span>
            <span style={{ color: "rgba(255,255,255,0.22)" }}>ctx </span>
            {formatCompact(contextUsed)}
            <span style={{ color: "rgba(255,255,255,0.22)" }}>/{formatCompact(CONTEXT_WINDOW)}</span>
            <span style={{ marginLeft: 5, color: "rgba(255,255,255,0.42)" }}>{pctLabel}</span>
          </span>
        </div>
      )}
    </div>
  );
}
