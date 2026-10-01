/**
 * Pure helpers for the Claude OAuth usage endpoint
 * (`GET https://api.anthropic.com/api/oauth/usage`).
 */

import type { RateLimitWindow, RateLimits } from "@shared/agent/events";
import { isRecord, readNumber } from "../../common/json";

function pickWindow(value: unknown, windowMinutes: number): RateLimitWindow | null {
  const utilization = readNumber(value, "utilization");
  if (!isRecord(value) || utilization === undefined) return null;
  let resetsAt: number | null = null;
  if (typeof value.resets_at === "string") {
    const ms = Date.parse(value.resets_at);
    if (Number.isFinite(ms)) resetsAt = Math.floor(ms / 1000);
  } else if (typeof value.resets_at === "number" && Number.isFinite(value.resets_at)) {
    resetsAt = value.resets_at;
  }
  return { used_percent: utilization, resets_at: resetsAt, window_minutes: windowMinutes };
}

/**
 * Converts the endpoint's `{ five_hour: { utilization, resets_at }, … }`
 * into the provider-agnostic `RateLimits` shape the renderer already uses
 * for Codex. Null when neither window is present.
 */
export function normalizeClaudeUsageResponse(json: unknown): RateLimits | null {
  if (!isRecord(json)) return null;
  const five = pickWindow(json.five_hour, 300);
  const seven = pickWindow(json.seven_day, 10080);
  if (!five && !seven) return null;
  return {
    ...(five ? { five_hour: five } : {}),
    ...(seven ? { seven_day: seven } : {}),
  };
}

/** `Retry-After` (delta-seconds or HTTP date) → positive seconds, else null. */
export function parseRetryAfter(headerValue: string | string[] | undefined, nowMs = Date.now()): number | null {
  const value = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    const seconds = Number.parseInt(trimmed, 10);
    return seconds > 0 ? seconds : null;
  }
  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) return null;
  const seconds = Math.ceil((ms - nowMs) / 1000);
  return seconds > 0 ? seconds : null;
}

/** `claudeAiOauth.accessToken` from a credentials JSON blob. */
export function extractOAuthAccessToken(raw: string): string | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || !isRecord(parsed.claudeAiOauth)) return null;
    const token = parsed.claudeAiOauth.accessToken;
    return typeof token === "string" && token ? token : null;
  } catch {
    return null;
  }
}
