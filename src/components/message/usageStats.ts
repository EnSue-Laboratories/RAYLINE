/** Pure formatting / derivation for the assistant footer (LoadingStatus). */
import type { RateLimits, TokenUsage } from "@shared/agent/usage";
import type { ModelDefinition } from "@shared/models/types";

export function formatCompact(n: number): string {
  if (!n) return "0";
  if (n < 1000) return String(n);
  if (n < 1_000_000) {
    const v = n / 1000;
    return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)}k`;
  }
  const v = n / 1_000_000;
  return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)}M`;
}

export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export function formatCost(cost: number): string {
  if (!Number.isFinite(cost) || cost <= 0) return "$0";
  if (cost < 0.0001) return "<$0.0001";
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

/** Coarse "resets in" label for a quota window (`resetsAtSec`: unix seconds). */
export function formatResetIn(resetsAtSec: number | null | undefined, nowMs: number): string | null {
  if (typeof resetsAtSec !== "number" || !Number.isFinite(resetsAtSec)) return null;
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

export function formatPercent(pct: number): string {
  return `${pct.toFixed(pct >= 10 || pct === 0 ? 0 : 1)}%`;
}

function nonNegative(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function finitePositive(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

export interface UsageStats {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cachedTokens: number;
  contextUsed: number;
  contextWindow: number | null;
  contextPct: number;
  costUsd: number;
  hasTokenUsage: boolean;
  hasCost: boolean;
}

/**
 * Footer numbers. Claude's `input_tokens` excludes cached tokens, so cache
 * read/create are folded into "in". Codex totals that exceed the model window
 * without an explicit window are cumulative and hidden.
 */
export function deriveUsageStats(usage: TokenUsage | null | undefined, model: Pick<ModelDefinition, "provider" | "contextWindow"> | null): UsageStats {
  const rawInput = nonNegative(usage?.input_tokens);
  const outputTokens = nonNegative(usage?.output_tokens);
  const reasoningTokens = nonNegative(usage?.reasoning_tokens);
  const cacheRead = nonNegative(usage?.cache_read_input_tokens);
  const cacheCreate = nonNegative(usage?.cache_creation_input_tokens);
  const inputTokens = model?.provider === "claude" ? rawInput + cacheRead + cacheCreate : rawInput;
  const contextUsed = finitePositive(usage?.total_tokens) ?? inputTokens + outputTokens + reasoningTokens;
  const configuredWindow = finitePositive(model?.contextWindow);
  const sourceWindow = finitePositive(usage?.context_window);
  const contextWindow = sourceWindow ?? configuredWindow;
  const likelyCumulativeCodex = model?.provider === "codex" && !sourceWindow && configuredWindow !== null && contextUsed > configuredWindow * 1.2;
  const costUsd = Number(usage?.cost_usd);
  const hasCost = Number.isFinite(costUsd) && costUsd > 0;
  const contextPct = contextUsed && contextWindow ? Math.max(0, Math.min(100, (contextUsed / contextWindow) * 100)) : 0;
  return {
    inputTokens,
    outputTokens,
    reasoningTokens,
    cachedTokens: cacheRead + cacheCreate,
    contextUsed,
    contextWindow,
    contextPct,
    costUsd,
    hasTokenUsage: contextUsed > 0 && !likelyCumulativeCodex,
    hasCost,
  };
}

export function hasQuota(rateLimits: RateLimits | null | undefined): boolean {
  return Number.isFinite(rateLimits?.five_hour?.used_percent) || Number.isFinite(rateLimits?.seven_day?.used_percent);
}

/** `remote-ssh:<claude|codex>:<base id>` → base model id (PR #230). */
export function remoteBaseModelId(modelId: string | null | undefined): string | null {
  return /^remote-ssh:(?:claude|codex):(.+)$/.exec(modelId ?? "")?.[1] ?? null;
}
