// Claude Code 5h/7d plan-quota fetcher.
//
// Source: GET https://api.anthropic.com/api/oauth/usage with the user's
// Claude Code OAuth token. This is the same endpoint ccstatusline uses
// (sirmalloc/ccstatusline:src/utils/usage-fetch.ts) — it's the only known
// way to get plan utilization for Claude Code, and it's only populated for
// Pro/Max subscribers (API-key users will have no token, so we return null
// silently and the renderer hides the line).
//
// The endpoint aggressively 429s, so we cache hard: 180s memory+file TTL,
// 30s lock-out after any failure, honor `Retry-After` on 429.

const fs = require("fs");
const path = require("path");
const os = require("os");
const https = require("https");
const { execFileSync } = require("child_process");
const { createLogger } = require("./logger.cjs");

const CACHE_DIR = path.join(os.homedir(), ".cache", "rayline");
const CACHE_FILE = path.join(CACHE_DIR, "claude-usage.json");
const LOCK_FILE = path.join(CACHE_DIR, "claude-usage.lock");
const CACHE_MAX_AGE_S = 180;
const LOCK_MAX_AGE_S = 30;
const DEFAULT_RATE_LIMIT_BACKOFF_S = 300;
const REQUEST_TIMEOUT_MS = 5000;

const KEYCHAIN_SERVICE = "Claude Code-credentials";

let memCache = null; // { ts, data } — data is the normalized shape or null
let memCacheTime = 0;
let memCacheMaxAge = CACHE_MAX_AGE_S;

const log = createLogger("claude-usage");

function ensureCacheDir() {
  try {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
  } catch {}
}

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function parseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readTokenFromCredentialsFile() {
  try {
    const credPath = path.join(os.homedir(), ".claude", ".credentials.json");
    const raw = fs.readFileSync(credPath, "utf8");
    const parsed = parseJson(raw);
    return parsed?.claudeAiOauth?.accessToken || null;
  } catch {
    return null;
  }
}

function readTokenFromKeychain() {
  if (process.platform !== "darwin") return null;
  try {
    const out = execFileSync(
      "security",
      ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-w"],
      { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }
    ).trim();
    if (!out) return null;
    const parsed = parseJson(out);
    return parsed?.claudeAiOauth?.accessToken || null;
  } catch {
    return null;
  }
}

function getOAuthToken() {
  // macOS: keychain first (Claude Code stores there), then credentials.json fallback.
  if (process.platform === "darwin") {
    return readTokenFromKeychain() || readTokenFromCredentialsFile();
  }
  return readTokenFromCredentialsFile();
}

// Convert API response into the same shape `useAgent.normalizeCodexRateLimits`
// produces, so the renderer is provider-agnostic. Codex shape:
//   { five_hour: { used_percent, resets_at: <unix s>, window_minutes }, seven_day: ... }
function normalizeApiResponse(json) {
  if (!json || typeof json !== "object") return null;
  const pickWindow = (w, windowMinutes) => {
    if (!w || typeof w !== "object") return null;
    if (!Number.isFinite(w.utilization)) return null;
    let resetsAt = null;
    if (typeof w.resets_at === "string") {
      const ms = Date.parse(w.resets_at);
      if (Number.isFinite(ms)) resetsAt = Math.floor(ms / 1000);
    } else if (Number.isFinite(w.resets_at)) {
      resetsAt = w.resets_at;
    }
    return {
      used_percent: w.utilization,
      resets_at: resetsAt,
      window_minutes: windowMinutes,
    };
  };
  const five = pickWindow(json.five_hour, 300);
  const seven = pickWindow(json.seven_day, 10080);
  if (!five && !seven) return null;
  return {
    ...(five ? { five_hour: five } : {}),
    ...(seven ? { seven_day: seven } : {}),
  };
}

function readFileCache() {
  try {
    const stat = fs.statSync(CACHE_FILE);
    const age = nowSec() - Math.floor(stat.mtimeMs / 1000);
    if (age >= CACHE_MAX_AGE_S) return null;
    const raw = fs.readFileSync(CACHE_FILE, "utf8");
    const parsed = parseJson(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writeFileCache(data) {
  try {
    ensureCacheDir();
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data));
  } catch {}
}

function readActiveLock() {
  try {
    const stat = fs.statSync(LOCK_FILE);
    const age = nowSec() - Math.floor(stat.mtimeMs / 1000);
    if (age < LOCK_MAX_AGE_S) {
      const raw = fs.readFileSync(LOCK_FILE, "utf8");
      const parsed = parseJson(raw);
      const blockedUntil = Number.isFinite(parsed?.blockedUntil)
        ? parsed.blockedUntil
        : Math.floor(stat.mtimeMs / 1000) + LOCK_MAX_AGE_S;
      if (blockedUntil > nowSec()) return blockedUntil;
    }
    return null;
  } catch {
    return null;
  }
}

function writeLock(blockedUntil) {
  try {
    ensureCacheDir();
    fs.writeFileSync(LOCK_FILE, JSON.stringify({ blockedUntil }));
  } catch {}
}

function parseRetryAfter(headerValue) {
  if (!headerValue) return null;
  const v = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (!v) return null;
  const trimmed = v.trim();
  if (/^\d+$/.test(trimmed)) {
    const seconds = parseInt(trimmed, 10);
    return seconds > 0 ? seconds : null;
  }
  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) return null;
  const s = Math.ceil((ms - Date.now()) / 1000);
  return s > 0 ? s : null;
}

function httpGetUsage(token) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (val) => {
      if (settled) return;
      settled = true;
      resolve(val);
    };

    const req = https.request(
      {
        hostname: "api.anthropic.com",
        path: "/api/oauth/usage",
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "anthropic-beta": "oauth-2025-04-20",
        },
        timeout: REQUEST_TIMEOUT_MS,
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          if (res.statusCode === 200) {
            finish({ kind: "ok", body });
          } else if (res.statusCode === 429) {
            finish({
              kind: "rate-limited",
              retryAfter: parseRetryAfter(res.headers["retry-after"]) ?? DEFAULT_RATE_LIMIT_BACKOFF_S,
            });
          } else {
            finish({ kind: "error", status: res.statusCode });
          }
        });
      }
    );

    req.on("error", () => finish({ kind: "error" }));
    req.on("timeout", () => {
      req.destroy();
      finish({ kind: "error" });
    });
    req.end();
  });
}

// Returns normalized rate-limits object, or null if unavailable (no token,
// rate-limited, error, etc.). Always resolves — never throws.
async function fetchClaudeUsage() {
  const t = nowSec();

  // Memory cache fast path
  if (memCache !== null && t - memCacheTime < memCacheMaxAge) {
    return memCache;
  }

  // File cache (cross-process — multiple Electron windows reuse the same data)
  const fileCached = readFileCache();
  if (fileCached) {
    const normalized = normalizeApiResponse(fileCached);
    memCache = normalized;
    memCacheTime = t;
    memCacheMaxAge = CACHE_MAX_AGE_S;
    return normalized;
  }

  // Lock check — recent failure means don't hammer the endpoint
  if (readActiveLock()) {
    memCache = null;
    memCacheTime = t;
    memCacheMaxAge = LOCK_MAX_AGE_S;
    return null;
  }

  const token = getOAuthToken();
  if (!token) {
    // No token = API-key user or unconfigured. Cache the null briefly so we
    // don't re-scan keychain on every turn.
    memCache = null;
    memCacheTime = t;
    memCacheMaxAge = CACHE_MAX_AGE_S;
    return null;
  }

  const result = await httpGetUsage(token);
  if (result.kind === "ok") {
    const parsed = parseJson(result.body);
    if (!parsed) {
      writeLock(t + LOCK_MAX_AGE_S);
      memCache = null;
      memCacheTime = t;
      memCacheMaxAge = LOCK_MAX_AGE_S;
      return null;
    }
    writeFileCache(parsed);
    const normalized = normalizeApiResponse(parsed);
    memCache = normalized;
    memCacheTime = t;
    memCacheMaxAge = CACHE_MAX_AGE_S;
    return normalized;
  }

  if (result.kind === "rate-limited") {
    const blockedUntil = t + result.retryAfter;
    writeLock(blockedUntil);
    log("Rate-limited by usage endpoint, backing off", { seconds: result.retryAfter });
    memCache = null;
    memCacheTime = t;
    memCacheMaxAge = result.retryAfter;
    return null;
  }

  // Generic error — short cooldown
  writeLock(t + LOCK_MAX_AGE_S);
  memCache = null;
  memCacheTime = t;
  memCacheMaxAge = LOCK_MAX_AGE_S;
  return null;
}

module.exports = { fetchClaudeUsage };
