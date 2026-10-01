import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { GhAuthEvent } from "@shared/github/types";
import { parseAuthStatusAccounts, parseAuthStatusUser } from "../auth";
import { DEVICE_URL, createAuthOutputParser } from "../auth-output";
import { isGhIssue, isGhRepoSummary } from "../guards";
import { linkedPrsFromTimeline } from "../repos";
import { startWebAuth } from "../web-auth";

describe("gh auth status parsing", () => {
  const STATUS = [
    "github.com",
    "  ✓ Logged in to github.com account alice (keyring)",
    "  - Active account: false",
    "  ✓ Logged in to github.com account bob (keyring)",
    "  - Active account: true",
  ].join("\n");

  it("lists accounts and the active one", () => {
    expect(parseAuthStatusAccounts(STATUS)).toEqual([
      { login: "alice", active: false },
      { login: "bob", active: true },
    ]);
    expect(parseAuthStatusAccounts("✓ Logged in to github.com as carol (oauth_token)")).toEqual([
      { login: "carol", active: true },
    ]);
    expect(parseAuthStatusUser("Logged in to github.com as dave (x)")).toBe("dave");
    expect(parseAuthStatusUser("")).toBeNull();
  });
});

describe("auth output parser", () => {
  it("answers prompts, reports the code once and detects success", () => {
    const parser = createAuthOutputParser();
    expect(parser.push("? Authenticate Git with your GitHub credentials? (Y/n)").writes).toEqual(["\r"]);
    const codeStep = parser.push("\x1b[1m! First copy your one-time code: AB12-CD34\x1b[0m\nPress Enter to open github.com");
    expect(codeStep.events).toEqual([
      { type: "code", code: "AB12-CD34" },
      { type: "browser", url: DEVICE_URL },
    ]);
    expect(codeStep.writes).toEqual(["\r"]);
    expect(parser.push("Press Enter to open github.com").events).toEqual([]);
    expect(parser.push("✓ Logged in as octocat").successUser).toBe("octocat");
    expect(parser.authenticated).toBe(true);
  });
});

describe("REST helpers", () => {
  it("validates payloads and extracts linked PRs", () => {
    expect(isGhIssue({ number: 1, title: "x" })).toBe(true);
    expect(isGhIssue({ message: "Not Found" })).toBe(false);
    expect(isGhRepoSummary({ nameWithOwner: "a/b", description: null })).toBe(true);
    const pr = { number: 7, title: "Fix", state: "open", html_url: "u", pull_request: {} };
    expect(
      linkedPrsFromTimeline([
        { event: "cross-referenced", source: { issue: pr } },
        { event: "cross-referenced", source: { issue: pr } },
        { event: "cross-referenced", source: { issue: { number: 8, title: "issue only" } } },
        { event: "labeled" },
      ]),
    ).toEqual([{ number: 7, title: "Fix", state: "open", html_url: "u" }]);
  });
});

describe.skipIf(process.platform === "win32")("startWebAuth (fake gh in a PTY)", () => {
  let dir: string;
  const originalGhBin = process.env.GH_BIN;

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "rl-fake-gh-"));
    const fake = path.join(dir, "gh");
    await writeFile(
      fake,
      [
        "#!/bin/sh",
        'echo "! First copy your one-time code: WXYZ-1234"',
        'printf "Press Enter to open github.com in your browser... "',
        "read _answer",
        'echo "✓ Authentication complete."',
        'echo "✓ Logged in as fake-user"',
      ].join("\n"),
    );
    await chmod(fake, 0o755);
    process.env.GH_BIN = fake;
  });

  afterAll(async () => {
    process.env.GH_BIN = originalGhBin;
    await rm(dir, { recursive: true, force: true });
  });

  it("drives the login flow to success", async () => {
    const events: GhAuthEvent[] = [];
    startWebAuth((event) => events.push(event));
    await vi.waitFor(() => expect(events.at(-1)).toEqual({ type: "success", user: "fake-user" }), { timeout: 5000 });
    expect(events.slice(0, 2)).toEqual([
      { type: "code", code: "WXYZ-1234" },
      { type: "browser", url: DEVICE_URL },
    ]);
  });
});
