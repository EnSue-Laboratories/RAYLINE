import { useEffect, useRef, useState } from "react";
import { useFontScale } from "../contexts/FontSizeContext";
import { getM } from "../data/models";

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

// Fallback context window when no model is known. Claude Sonnet/Opus defaults.
const DEFAULT_CONTEXT_WINDOW = 200_000;

const PHRASE_INTERVAL_MS = 2400;


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

// Coarse "resets in" label for plan-quota windows (5h / 7d).
// resetsAtSec is unix epoch seconds; nowMs is wall clock (param so the
// component can re-render against its existing `now` tick).
function formatResetIn(resetsAtSec, nowMs) {
  if (!Number.isFinite(resetsAtSec)) return null;
  const remaining = resetsAtSec * 1000 - nowMs;
  if (remaining <= 0) return "now";
  const min = Math.floor(remaining / 60000);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) {
    const m = min % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(h / 24);
  const r = h % 24;
  return r ? `${d}d ${r}h` : `${d}d`;
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
          stroke="var(--spinner-ink)"
          strokeWidth="2"
          strokeLinecap="square"
          style={{ animation: "slashPulse 1.4s ease-in-out infinite" }}
        />
        {/* Dot — trailing accent that echoes the logo's period. */}
        <circle
          cx="13"
          cy="11.5"
          r="1.5"
          fill="var(--spinner-ink)"
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

export default function LoadingStatus({ startedAt, elapsedMs: frozenElapsedMs, usage, rateLimits, isStreaming, modelId, compacting }) {
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

  const model = modelId ? getM(modelId) : null;
  const isCodex = model?.provider === "codex";
  const rawInputTokens = usage?.input_tokens || 0;
  const outputTokens = usage?.output_tokens || 0;
  const cacheRead = usage?.cache_read_input_tokens || 0;
  const cacheCreate = usage?.cache_creation_input_tokens || 0;
  // Claude's `input_tokens` field excludes cached portions; users read "in" as
  // the total prompt size, so fold cache read/create into it. `cached` still
  // shows the breakdown of how much of that was served from cache.
  const inputTokens = isCodex
    ? rawInputTokens
    : rawInputTokens + cacheRead + cacheCreate;
  const derivedContextUsed = isCodex
    ? rawInputTokens + outputTokens
    : inputTokens + outputTokens;
  const contextUsed = Number.isFinite(usage?.total_tokens) && usage.total_tokens > 0
    ? usage.total_tokens
    : derivedContextUsed;
  const configuredContextWindow = model?.contextWindow || DEFAULT_CONTEXT_WINDOW;
  const contextWindow = usage?.context_window || configuredContextWindow;
  const hasExplicitContextWindow = Number.isFinite(usage?.context_window);
  const isLikelyCumulativeCodexUsage =
    isCodex &&
    !hasExplicitContextWindow &&
    contextUsed > configuredContextWindow * 1.2;
  const contextPct = contextUsed
    ? Math.max(0, Math.min(100, (contextUsed / contextWindow) * 100))
    : 0;

  const hasUsage = contextUsed > 0 && !isLikelyCumulativeCodexUsage;

  const fiveHour = rateLimits?.five_hour;
  const sevenDay = rateLimits?.seven_day;
  const hasRateLimits =
    Number.isFinite(fiveHour?.used_percent) || Number.isFinite(sevenDay?.used_percent);

  // Nothing to say after completion if we never captured any stats.
  if (!isStreaming && !hasUsage && !hasRateLimits && !startedAt && frozenElapsedMs == null) return null;

  const elapsedLabel = formatDuration(elapsedMs);
  const pctLabel = contextPct.toFixed(contextPct >= 10 || contextPct === 0 ? 0 : 1) + "%";

  const primary = isStreaming ? PHRASES[phraseIdx] : "Done";
  const primaryColor = isStreaming ? "var(--text-secondary)" : "var(--text-muted)";
  const secondaryColor = "var(--text-faint)";
  // Stat separator — subtle skewed slash glyph in neutral dim.
  const sep = (
    <span
      aria-hidden="true"
      style={{
        color: "var(--text-faint)",
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
        @keyframes compactSpin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
      {/* Line 1: slash spinner + phrase + elapsed */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {isStreaming && <SlashSpinner />}
        <span style={{ color: primaryColor }}>
          {primary}
          {isStreaming && (
            <span style={{ color: "var(--text-muted)", marginLeft: 2 }}>…</span>
          )}
        </span>
        <span style={{ color: secondaryColor, fontVariantNumeric: "tabular-nums" }}>
          {elapsedLabel}
        </span>
        {isStreaming && compacting && (
          <span
            title="Claude Code is auto-compacting earlier context."
            style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--text-tertiary)" }}
          >
            <span style={{ display: "inline-block", animation: "compactSpin 1.6s linear infinite" }}>↻</span>
            compacting
          </span>
        )}
      </div>

      {/* Line 2: token breakdown + context */}
      {hasUsage && (
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", color: secondaryColor, fontVariantNumeric: "tabular-nums" }}>
          <span>
            <span style={{ color: "var(--text-faint)" }}>in </span>
            {formatCompact(inputTokens)}
          </span>
          {sep}
          <span>
            <span style={{ color: "var(--text-faint)" }}>out </span>
            {formatCompact(outputTokens)}
          </span>
          {(cacheRead + cacheCreate) > 0 && (
            <>
              {sep}
              <span>
                <span style={{ color: "var(--text-faint)" }}>cached </span>
                {formatCompact(cacheRead + cacheCreate)}
              </span>
            </>
          )}
          {sep}
          <span>
            <span style={{ color: "var(--text-faint)" }}>ctx </span>
            {formatCompact(contextUsed)}
            <span style={{ color: "var(--text-faint)" }}>/{formatCompact(contextWindow)}</span>
            <span style={{ marginLeft: 5, color: "var(--text-muted)" }}>{pctLabel}</span>
          </span>
        </div>
      )}

      {/* Line 3: plan quota windows (5h rolling + 7d weekly).
          Codex sourced from `event_msg.token_count.rate_limits`. Claude Code
          sourced from `api.anthropic.com/api/oauth/usage` (Pro/Max only —
          API-key users have no token, so the line silently hides). */}
      {hasRateLimits && (
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", color: secondaryColor, fontVariantNumeric: "tabular-nums" }}>
          {Number.isFinite(fiveHour?.used_percent) && (
            <PlanQuota label="5h" pct={fiveHour.used_percent} resetIn={formatResetIn(fiveHour.resets_at, now)} />
          )}
          {Number.isFinite(fiveHour?.used_percent) && Number.isFinite(sevenDay?.used_percent) && sep}
          {Number.isFinite(sevenDay?.used_percent) && (
            <PlanQuota label="7d" pct={sevenDay.used_percent} resetIn={formatResetIn(sevenDay.resets_at, now)} />
          )}
        </div>
      )}
    </div>
  );
}

// Single plan-quota chip: "5h 100% · resets 4h 12m"
// Saturated quota (≥95%) gets a warmer ink so it reads at a glance, but stays
// within the existing muted palette — no full red.
function PlanQuota({ label, pct, resetIn }) {
  const saturated = pct >= 95;
  const pctInk = saturated ? "var(--danger-soft-text)" : "var(--text-tertiary)";
  const pctLabel = pct.toFixed(pct >= 10 || pct === 0 ? 0 : 1) + "%";
  return (
    <span>
      <span style={{ color: "var(--text-faint)" }}>{label} </span>
      <span style={{ color: pctInk }}>{pctLabel}</span>
      {resetIn && (
        <span style={{ color: "var(--text-faint)", marginLeft: 6 }}>
          resets {resetIn}
        </span>
      )}
    </span>
  );
}
