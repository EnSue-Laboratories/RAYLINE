import { describe, expect, it } from "vitest";
import type { Translate } from "../boundary";
import {
  buildGithubNewItemUrl,
  checkoutCommand,
  cleanIpcError,
  githubItemUrl,
  itemSummary,
  parsePrNumber,
  repoShortName,
  timeAgo,
} from "../format";

const t: Translate = (key, vars) => `${key}:${vars?.count ?? ""}`;
const NOW = Date.parse("2026-01-31T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe("timeAgo", () => {
  it("picks minutes, hours, days and months", () => {
    expect(timeAgo(ago(5 * 60_000), t, NOW)).toBe("pm.timeMinutesAgo:5");
    expect(timeAgo(ago(3 * 3_600_000), t, NOW)).toBe("pm.timeHoursAgo:3");
    expect(timeAgo(ago(2 * 86_400_000), t, NOW)).toBe("pm.timeDaysAgo:2");
    expect(timeAgo(ago(65 * 86_400_000), t, NOW)).toBe("pm.timeMonthsAgo:2");
  });
});

describe("cleanIpcError", () => {
  it("strips the Electron invoke prefix and a leading Error:", () => {
    expect(cleanIpcError("Error invoking remote method 'gh-auth-start': Error: gh not found")).toBe("gh not found");
  });

  it("falls back for empty messages", () => {
    expect(cleanIpcError(undefined)).toBe("Unknown error");
    expect(cleanIpcError("", "nope")).toBe("nope");
  });
});

describe("GitHub links", () => {
  it("builds item URLs, summaries and checkout commands", () => {
    expect(githubItemUrl("o/r", "pr", 4)).toBe("https://github.com/o/r/pull/4");
    expect(githubItemUrl("o/r", "issue", 4)).toBe("https://github.com/o/r/issues/4");
    expect(itemSummary("o/r", "issue", 4, "Fix it")).toBe("#4 Fix it https://github.com/o/r/issues/4");
    expect(checkoutCommand("o/r", 9)).toBe("gh pr checkout 9 -R o/r");
  });

  it("parses the PR number printed by gh pr create", () => {
    expect(parsePrNumber("https://github.com/o/r/pull/123\n")).toBe(123);
    expect(parsePrNumber("no url")).toBeNull();
    expect(parsePrNumber(undefined)).toBeNull();
  });

  it("encodes prefilled new-item URLs", () => {
    const draft = { repo: "o/r", title: " A & B ", body: "x y", head: "feat/x", base: "main" };
    expect(buildGithubNewItemUrl({ ...draft, type: "issue" })).toBe(
      "https://github.com/o/r/issues/new?title=A%20%26%20B&body=x%20y",
    );
    expect(buildGithubNewItemUrl({ ...draft, type: "pr" })).toBe(
      "https://github.com/o/r/compare/main...feat%2Fx?expand=1&title=A%20%26%20B&body=x%20y",
    );
  });

  it("shortens repo slugs", () => {
    expect(repoShortName("owner/name")).toBe("name");
    expect(repoShortName("solo")).toBe("solo");
  });
});
