import type { ClaudeApiUsage, CodexRawRateLimits, CodexRawRateLimitWindow, CodexRawTokenUsage, OpenCodePart, RateLimitWindow, RateLimits, TokenUsage } from "@shared/agent/events";

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

const TOKEN_USAGE_NUMBER_KEYS = [
  "input_tokens",
  "output_tokens",
  "reasoning_tokens",
  "cache_creation_input_tokens",
  "cache_read_input_tokens",
  "context_window",
  "cost_usd",
] as const;

/**
 * Claude `message_start` / `message_delta` usage → TokenUsage. Keeps the
 * numeric token fields as-is (nulls dropped; consumers treat null and
 * missing the same).
 */
export function claudeUsageToTokenUsage(usage: Partial<ClaudeApiUsage>): TokenUsage {
  const out: TokenUsage = {};
  const record: Record<string, unknown> = { ...usage };
  for (const key of TOKEN_USAGE_NUMBER_KEYS) {
    const value = record[key];
    if (typeof value === "number") out[key] = value;
  }
  return out;
}

/** Merge a usage packet into the previous one (latest API call wins per field). */
export function mergeUsage(prev: TokenUsage | null | undefined, incoming: TokenUsage | null | undefined): TokenUsage | null {
  if (!incoming) return prev ?? null;
  const base: TokenUsage = prev ?? {};
  const incomingCost = Number(incoming.cost_usd);
  const baseCost = Number(base.cost_usd);
  const merged: TokenUsage = {
    input_tokens: incoming.input_tokens ?? base.input_tokens ?? 0,
    output_tokens: incoming.output_tokens ?? base.output_tokens ?? 0,
    reasoning_tokens: incoming.reasoning_tokens ?? base.reasoning_tokens ?? 0,
    cache_creation_input_tokens: incoming.cache_creation_input_tokens ?? base.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens: incoming.cache_read_input_tokens ?? base.cache_read_input_tokens ?? 0,
  };
  if (incomingCost > 0) merged.cost_usd = incomingCost;
  else if (baseCost > 0) merged.cost_usd = baseCost;
  if (isFiniteNumber(incoming.total_tokens)) merged.total_tokens = incoming.total_tokens;
  else if (isFiniteNumber(base.total_tokens)) merged.total_tokens = base.total_tokens;
  if (isFiniteNumber(incoming.context_window)) merged.context_window = incoming.context_window;
  else if (isFiniteNumber(base.context_window)) merged.context_window = base.context_window;
  return merged;
}

interface CodexUsageLike extends CodexRawTokenUsage {
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  /** `turn.completed.usage` (exec --json) spelling of cache creation. */
  cache_write_input_tokens?: number;
}

export function normalizeCodexUsage(usage: CodexUsageLike | null | undefined, contextWindow?: number): TokenUsage | null {
  if (!usage) return null;
  const out: TokenUsage = {
    input_tokens: usage.input_tokens ?? 0,
    output_tokens: usage.output_tokens ?? 0,
    total_tokens: usage.total_tokens ?? null,
    cache_read_input_tokens: usage.cached_input_tokens ?? usage.cache_read_input_tokens ?? 0,
    cache_creation_input_tokens: usage.cache_creation_input_tokens ?? usage.cache_write_input_tokens ?? 0,
  };
  if (isFiniteNumber(usage.reasoning_output_tokens)) out.reasoning_tokens = usage.reasoning_output_tokens;
  if (isFiniteNumber(contextWindow)) out.context_window = contextWindow;
  return out;
}

function pickRateLimitWindow(window: CodexRawRateLimitWindow | null | undefined): RateLimitWindow | null {
  if (!window || typeof window !== "object") return null;
  if (!isFiniteNumber(window.used_percent)) return null;
  return {
    used_percent: window.used_percent,
    resets_at: isFiniteNumber(window.resets_at) ? window.resets_at : null,
    window_minutes: isFiniteNumber(window.window_minutes) ? window.window_minutes : null,
  };
}

/**
 * Codex `token_count.rate_limits` (`primary` = 5h, `secondary` = 7d) →
 * provider-agnostic `{ five_hour, seven_day }`.
 */
export function normalizeCodexRateLimits(rateLimits: CodexRawRateLimits | null | undefined): RateLimits | null {
  if (!rateLimits || typeof rateLimits !== "object") return null;
  const five = pickRateLimitWindow(rateLimits.primary);
  const seven = pickRateLimitWindow(rateLimits.secondary);
  if (!five && !seven) return null;
  const out: RateLimits = {};
  if (five) out.five_hour = five;
  if (seven) out.seven_day = seven;
  if (rateLimits.plan_type) out.plan_type = rateLimits.plan_type;
  return out;
}

/** OpenCode `step_finish` part tokens → TokenUsage, accumulating cost across steps. */
export function normalizeOpenCodeUsage(part: OpenCodePart | undefined, previousUsage: TokenUsage | null | undefined): TokenUsage | null {
  const tokens = part?.tokens;
  if (!tokens || typeof tokens !== "object") return previousUsage ?? null;
  const previousCost = isFiniteNumber(previousUsage?.cost_usd) ? previousUsage.cost_usd : 0;
  const stepCost = Number(part.cost);
  const safeStepCost = Number.isFinite(stepCost) && stepCost > 0 ? stepCost : 0;
  const out: TokenUsage = {
    input_tokens: tokens.input ?? 0,
    output_tokens: tokens.output ?? 0,
    total_tokens: tokens.total ?? null,
    cache_read_input_tokens: tokens.cache?.read ?? 0,
    cache_creation_input_tokens: tokens.cache?.write ?? 0,
    reasoning_tokens: tokens.reasoning ?? 0,
  };
  if (previousCost > 0 || safeStepCost > 0) out.cost_usd = previousCost + safeStepCost;
  return out;
}
