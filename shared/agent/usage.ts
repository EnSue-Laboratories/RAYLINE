/**
 * Provider-agnostic token usage / plan-quota shapes attached to assistant
 * messages (`message._usage`, `message._rateLimits`).
 */

/**
 * Normalized token usage. Claude's `message_start`/`message_delta` usage
 * objects are stored as-is (same snake_case keys); Codex and OpenCode usage is
 * converted into this shape by the renderer / session reader.
 */
export interface TokenUsage {
  input_tokens?: number;
  output_tokens?: number;
  reasoning_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  /** Provider-reported total (Codex); null when unknown. */
  total_tokens?: number | null;
  /** Context window reported by the provider for this run. */
  context_window?: number;
  cost_usd?: number;
}

/** One rolling quota window. */
export interface RateLimitWindow {
  /** 0–100 */
  used_percent: number;
  /** Unix seconds, or null when unknown. */
  resets_at: number | null;
  window_minutes: number | null;
}

/**
 * Plan quota snapshot. Codex `primary`/`secondary` and Claude's OAuth usage
 * endpoint (`five_hour`/`seven_day`) are both normalized to this.
 */
export interface RateLimits {
  five_hour?: RateLimitWindow;
  seven_day?: RateLimitWindow;
  plan_type?: string;
}
