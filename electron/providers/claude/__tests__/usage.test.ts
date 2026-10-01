import { describe, expect, it } from "vitest";
import { extractOAuthAccessToken, normalizeClaudeUsageResponse, parseRetryAfter } from "../usage/normalize";

describe("Claude usage normalization", () => {
  it("maps the OAuth usage response to RateLimits", () => {
    expect(
      normalizeClaudeUsageResponse({
        five_hour: { utilization: 42, resets_at: "2026-10-01T12:00:00Z" },
        seven_day: { utilization: 7.5, resets_at: 1790904000 },
        seven_day_opus: null,
      }),
    ).toEqual({
      five_hour: { used_percent: 42, resets_at: Date.parse("2026-10-01T12:00:00Z") / 1000, window_minutes: 300 },
      seven_day: { used_percent: 7.5, resets_at: 1790904000, window_minutes: 10080 },
    });
    expect(normalizeClaudeUsageResponse({ five_hour: { utilization: "x" } })).toBeNull();
    expect(normalizeClaudeUsageResponse(null)).toBeNull();
  });

  it("parses Retry-After seconds and dates", () => {
    expect(parseRetryAfter("120")).toBe(120);
    expect(parseRetryAfter(["30"])).toBe(30);
    expect(parseRetryAfter("0")).toBeNull();
    expect(parseRetryAfter("Thu, 01 Oct 2026 00:01:00 GMT", Date.parse("Thu, 01 Oct 2026 00:00:00 GMT"))).toBe(60);
    expect(parseRetryAfter(undefined)).toBeNull();
  });

  it("extracts the OAuth access token from credentials JSON", () => {
    expect(extractOAuthAccessToken('{"claudeAiOauth":{"accessToken":"tok"}}')).toBe("tok");
    expect(extractOAuthAccessToken('{"claudeAiOauth":{}}')).toBeNull();
    expect(extractOAuthAccessToken("not json")).toBeNull();
  });
});
