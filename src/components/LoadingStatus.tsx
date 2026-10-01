import { useEffect, useState } from "react";
import type { RateLimits, RateLimitWindow, TokenUsage } from "@shared/agent/usage";
import { isOpenCodeModelId } from "@shared/models";
import { useFontScale } from "../contexts/FontSizeContext";
import { useModelCatalog } from "./model-picker/useModelCatalog";
import { deriveUsageStats, formatCompact, formatCost, formatDuration, formatPercent, formatResetIn, hasQuota, remoteBaseModelId } from "./message/usageStats";

// Rotating status phrases while the agent works.
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

const PHRASE_INTERVAL_MS = 2400;
// The elapsed label has 1 s resolution; ticking faster only re-rendered.
const TICK_MS = 1000;

// Muted spinner ink — keeps the logo's slash+dot geometry but drops the red
// accent so the indicator stays quiet in the message vibe.
const SPINNER_INK = "var(--text-secondary)";

function finiteWindow(window: RateLimitWindow | undefined): RateLimitWindow | null {
  return window && Number.isFinite(window.used_percent) ? window : null;
}

// Slash+dot spinner — keeps the RayLine logo's "/•" geometry in a muted ink;
// both elements pulse out of phase.
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

export interface LoadingStatusProps {
  startedAt?: number;
  /** Frozen duration once the turn ended (survives reloads). */
  elapsedMs?: number;
  usage?: TokenUsage | null;
  rateLimits?: RateLimits | null;
  isStreaming: boolean;
  modelId?: string | null;
  compacting?: boolean;
}

export default function LoadingStatus({ startedAt, elapsedMs: frozenElapsedMs, usage, rateLimits, isStreaming, modelId, compacting }: LoadingStatusProps) {
  const s = useFontScale();
  const [now, setNow] = useState(() => Date.now());
  const [phraseIdx, setPhraseIdx] = useState(0);

  useEffect(() => {
    if (!isStreaming) return undefined;
    const tick = window.setInterval(() => setNow(Date.now()), TICK_MS);
    const cycle = window.setInterval(() => setPhraseIdx((index) => (index + 1) % PHRASES.length), PHRASE_INTERVAL_MS);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(cycle);
    };
  }, [isStreaming]);

  // A persisted elapsed value wins after the turn (Date.now() - _startedAt drifts across sessions).
  const elapsedMs = isStreaming ? (startedAt ? now - startedAt : 0) : (frozenElapsedMs ?? (startedAt ? now - startedAt : 0));

  // Runtime catalog (discovered context windows); remote-ssh ids resolve their base model.
  const { getModel } = useModelCatalog();
  const remoteId = remoteBaseModelId(modelId);
  const model = modelId && !isOpenCodeModelId(modelId) ? getModel(remoteId || modelId) : null;
  const stats = deriveUsageStats(usage, model);
  const hasUsage = stats.hasTokenUsage || stats.hasCost;
  const fiveHour = finiteWindow(rateLimits?.five_hour);
  const sevenDay = finiteWindow(rateLimits?.seven_day);
  const hasRateLimits = hasQuota(rateLimits);

  // Nothing to say after completion if no stats were ever captured.
  if (!isStreaming && !hasUsage && !hasRateLimits && !startedAt && frozenElapsedMs == null) return null;

  const elapsedLabel = formatDuration(elapsedMs);
  const pctLabel = formatPercent(stats.contextPct);
  const primary = isStreaming ? PHRASES[phraseIdx] : "Done";
  const primaryColor = isStreaming ? "var(--text-primary)" : "var(--text-muted)";
  const secondaryColor = "var(--text-muted)";
  const sep = (
    <span aria-hidden="true" style={{ color: "var(--text-muted)", margin: "0 6px", transform: "skewX(-18deg)", display: "inline-block" }}>
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
        fontFamily: "var(--font-mono)",
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
            style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--text-secondary)" }}
          >
            <span style={{ display: "inline-block", animation: "compactSpin 1.6s linear infinite" }}>↻</span>
            compacting
          </span>
        )}
      </div>

      {/* Line 2: token breakdown + context */}
      {hasUsage && (
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", color: secondaryColor, fontVariantNumeric: "tabular-nums" }}>
          {stats.hasTokenUsage && (
            <>
              <span>
                <span style={{ color: "var(--text-muted)" }}>in </span>
                {formatCompact(stats.inputTokens)}
              </span>
              {sep}
              <span>
                <span style={{ color: "var(--text-muted)" }}>out </span>
                {formatCompact(stats.outputTokens)}
              </span>
              {stats.reasoningTokens > 0 && (
                <>
                  {sep}
                  <span>
                    <span style={{ color: "var(--text-muted)" }}>think </span>
                    {formatCompact(stats.reasoningTokens)}
                  </span>
                </>
              )}
              {stats.cachedTokens > 0 && (
                <>
                  {sep}
                  <span>
                    <span style={{ color: "var(--text-muted)" }}>cached </span>
                    {formatCompact(stats.cachedTokens)}
                  </span>
                </>
              )}
              {sep}
              <span>
                <span style={{ color: "var(--text-muted)" }}>ctx </span>
                {formatCompact(stats.contextUsed)}
                {stats.contextWindow !== null && (
                  <>
                    <span style={{ color: "var(--text-muted)" }}>/{formatCompact(stats.contextWindow)}</span>
                    <span style={{ marginLeft: 5, color: "var(--text-secondary)" }}>{pctLabel}</span>
                  </>
                )}
              </span>
            </>
          )}
          {stats.hasTokenUsage && stats.hasCost && sep}
          {stats.hasCost && (
            <span>
              <span style={{ color: "var(--text-muted)" }}>cost </span>
              {formatCost(stats.costUsd)}
            </span>
          )}
        </div>
      )}

      {/* Line 3: plan quota windows (5h rolling + 7d weekly).
          Codex sourced from `event_msg.token_count.rate_limits`. Claude Code
          sourced from `api.anthropic.com/api/oauth/usage` (Pro/Max only —
          API-key users have no token, so the line silently hides). */}
      {hasRateLimits && (
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", color: secondaryColor, fontVariantNumeric: "tabular-nums" }}>
          {fiveHour && <PlanQuota label="5h" pct={fiveHour.used_percent} resetIn={formatResetIn(fiveHour.resets_at, now)} />}
          {fiveHour && sevenDay && sep}
          {sevenDay && <PlanQuota label="7d" pct={sevenDay.used_percent} resetIn={formatResetIn(sevenDay.resets_at, now)} />}
        </div>
      )}
    </div>
  );
}


// Single plan-quota chip: "5h 100% · resets 4h 12m". Saturated quota (≥95%)
// gets a warmer ink without going full red.
function PlanQuota({ label, pct, resetIn }: { label: string; pct: number; resetIn: string | null }) {
  const saturated = pct >= 95;
  const pctInk = saturated ? "var(--accent)" : "var(--text-secondary)";
  const pctLabel = formatPercent(pct);
  return (
    <span>
      <span style={{ color: "var(--text-muted)" }}>{label} </span>
      <span style={{ color: pctInk }}>{pctLabel}</span>
      {resetIn && (
        <span style={{ color: "var(--text-muted)", marginLeft: 6 }}>
          resets {resetIn}
        </span>
      )}
    </span>
  );
}
