/**
 * Claude Code 5h/7d plan-quota fetcher.
 *
 * Source: GET https://api.anthropic.com/api/oauth/usage with the user's
 * Claude Code OAuth token (same endpoint ccstatusline uses). Only populated
 * for Pro/Max subscribers; API-key users have no token, so we resolve null
 * silently and the renderer hides the line.
 *
 * The endpoint aggressively 429s, so we cache hard: 180 s memory + file TTL,
 * 30 s lock-out after any failure, `Retry-After` honored on 429. Everything
 * is async (the keychain read used to be a blocking `execFileSync`), and
 * concurrent callers share one in-flight request.
 */

import https from "node:https";
import type { RateLimits } from "@shared/agent/events";
import { createLogger } from "./providers/common/boundary";
import { safeJsonParse } from "./providers/common/json";
import {
  CACHE_MAX_AGE_S,
  LOCK_MAX_AGE_S,
  nowSec,
  readActiveLock,
  readFileCache,
  writeFileCache,
  writeLock,
} from "./providers/claude/usage/cache-files";
import { normalizeClaudeUsageResponse, parseRetryAfter } from "./providers/claude/usage/normalize";
import { getOAuthToken, invalidateOAuthToken } from "./providers/claude/usage/oauth-token";

const DEFAULT_RATE_LIMIT_BACKOFF_S = 300;
const REQUEST_TIMEOUT_MS = 5000;

type UsageHttpResult =
  | { kind: "ok"; body: string }
  | { kind: "rate-limited"; retryAfter: number }
  | { kind: "error"; status?: number };

const log = createLogger("claude-usage");

let memCache: RateLimits | null = null;
let memCacheTime = 0;
let memCacheMaxAge = CACHE_MAX_AGE_S;
let inFlight: Promise<RateLimits | null> | null = null;

function remember(value: RateLimits | null, at: number, maxAge: number): RateLimits | null {
  memCache = value;
  memCacheTime = at;
  memCacheMaxAge = maxAge;
  return value;
}

function httpGetUsage(token: string): Promise<UsageHttpResult> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: UsageHttpResult): void => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const req = https.request(
      {
        hostname: "api.anthropic.com",
        path: "/api/oauth/usage",
        method: "GET",
        headers: { Authorization: `Bearer ${token}`, "anthropic-beta": "oauth-2025-04-20" },
        timeout: REQUEST_TIMEOUT_MS,
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          body += chunk;
        });
        res.on("end", () => {
          if (res.statusCode === 200) finish({ kind: "ok", body });
          else if (res.statusCode === 429) {
            finish({ kind: "rate-limited", retryAfter: parseRetryAfter(res.headers["retry-after"]) ?? DEFAULT_RATE_LIMIT_BACKOFF_S });
          } else finish({ kind: "error", status: res.statusCode });
        });
      },
    );
    req.on("error", () => finish({ kind: "error" }));
    req.on("timeout", () => {
      req.destroy();
      finish({ kind: "error" });
    });
    req.end();
  });
}

async function fetchUncached(t: number): Promise<RateLimits | null> {
  // File cache (cross-process — multiple windows / app instances reuse it).
  const fileCached = await readFileCache();
  if (fileCached) return remember(normalizeClaudeUsageResponse(fileCached), t, CACHE_MAX_AGE_S);

  // Recent failure: don't hammer the endpoint.
  if (await readActiveLock()) return remember(null, t, LOCK_MAX_AGE_S);

  const token = await getOAuthToken();
  // No token = API-key user or unconfigured. Cache the null so we don't
  // re-scan the keychain on every turn.
  if (!token) return remember(null, t, CACHE_MAX_AGE_S);

  const result = await httpGetUsage(token);
  switch (result.kind) {
    case "ok": {
      const parsed = safeJsonParse(result.body);
      if (parsed === undefined) {
        await writeLock(t + LOCK_MAX_AGE_S);
        return remember(null, t, LOCK_MAX_AGE_S);
      }
      await writeFileCache(parsed);
      return remember(normalizeClaudeUsageResponse(parsed), t, CACHE_MAX_AGE_S);
    }
    case "rate-limited":
      await writeLock(t + result.retryAfter);
      log("Rate-limited by usage endpoint, backing off", { seconds: result.retryAfter });
      return remember(null, t, result.retryAfter);
    case "error":
      if (result.status === 401) invalidateOAuthToken();
      await writeLock(t + LOCK_MAX_AGE_S);
      return remember(null, t, LOCK_MAX_AGE_S);
    default: {
      const exhaustive: never = result;
      return exhaustive;
    }
  }
}

/**
 * Normalized plan quota, or null when unavailable (no token, rate-limited,
 * error…). Always resolves — never rejects.
 */
export function fetchClaudeUsage(): Promise<RateLimits | null> {
  const t = nowSec();
  if (memCacheTime && t - memCacheTime < memCacheMaxAge) return Promise.resolve(memCache);
  if (inFlight) return inFlight;
  inFlight = fetchUncached(t)
    .catch((err: unknown) => {
      log("Usage fetch failed:", err);
      return null;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}
