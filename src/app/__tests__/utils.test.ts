import { describe, expect, it } from "vitest";
import { buildConversationPrime, buildCrossProviderPrime, decoratePromptWithPrime } from "../../utils/crossProviderPrime";
import { buildMissingCwdReminder, decoratePromptWithReminder, getMainRepoRoot, resolveSafeCwd } from "../../utils/cwdRecovery";
import { clearPinnedTabs, computeTabState, markSeenPatch, resetPinnedTabs, withTabPatch } from "../../utils/tabs";
import { relativeTime } from "../../utils/time";
import { deepEqual } from "../lib/deepEqual";
import { orderForPreviewHydration } from "../actions/navigation";
import { assistant, convo, user } from "./fixtures";

describe("cwdRecovery", () => {
  it("falls back to the worktree root, then the app cwd", () => {
    const exists = (p: string) => p === "/repo" || p === "/app";
    expect(resolveSafeCwd({ cwd: "/repo/.worktrees/x", appCwd: "/app", exists })).toMatchObject({ cwd: "/repo", wasMissing: true, recoveryReason: "worktree-root" });
    expect(resolveSafeCwd({ cwd: "/gone", appCwd: "/app", exists })).toMatchObject({ cwd: "/app", recoveryReason: "app-cwd" });
    expect(resolveSafeCwd({ cwd: "/gone", appCwd: null, exists })).toMatchObject({ cwd: null, recoveryReason: "none" });
    expect(getMainRepoRoot("/repo/.worktrees/x/y")).toBe("/repo");
  });

  it("builds a system reminder only with an original cwd", () => {
    const reminder = buildMissingCwdReminder({ originalCwd: "/a", recoveredCwd: "/b", recoveryReason: "worktree-root" });
    expect(reminder).toContain("<system-reminder>");
    expect(buildMissingCwdReminder({ originalCwd: null, recoveredCwd: null, recoveryReason: "none" })).toBeNull();
    expect(decoratePromptWithReminder("p", null)).toBe("p");
  });
});

describe("crossProviderPrime", () => {
  it("keeps the newest lines within the budget, oldest first", () => {
    const prime = buildConversationPrime([user("1", "aaaa"), assistant("2", "bbbb"), user("3", "cccc")], { charBudget: 30 });
    expect(prime).toContain("Assistant: bbbb\n\nUser: cccc");
    expect(prime).not.toContain("aaaa");
    expect(buildCrossProviderPrime([])).toBeNull();
    expect(decoratePromptWithPrime("q", "P")).toBe("P\n\n---\n\nq");
  });
});

describe("tab utils", () => {
  it("computes done/seen state and unpins below the minimum", () => {
    const done = withTabPatch(convo({ id: "a" }), { pinned: true, runEndedAt: 10, lastSeenAt: 1 });
    expect(computeTabState(done, { isStreaming: false })).toBe("done");
    expect(computeTabState(withTabPatch(done, markSeenPatch(20)), { isStreaming: false })).toBe("seen");
    const list = [done, convo({ id: "b" })];
    expect(resetPinnedTabs(list)[0]?.tab?.pinned).toBe(false);
    const none = [convo({ id: "x" })];
    expect(clearPinnedTabs(none)).toBe(none);
  });

  it("relativeTime buckets", () => {
    expect(relativeTime(0, 30_000)).toBe("now");
    expect(relativeTime(0, 5 * 60_000)).toBe("5m");
    expect(relativeTime(0, 3 * 86_400_000)).toBe("3d");
  });
});

describe("misc", () => {
  it("deepEqual compares JSON-like data", () => {
    expect(deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(deepEqual([1], { 0: 1 })).toBe(false);
  });

  it("preview hydration: active first, then most recent, only rows missing data", () => {
    const rows = [
      convo({ id: "old", ts: 1 }),
      convo({ id: "new", ts: 9 }),
      convo({ id: "act", ts: 5 }),
      convo({ id: "done", ts: 10, lastPreview: "p", cwd: "/x", lastProvider: "claude" }),
    ];
    expect(orderForPreviewHydration(rows, "act").map((c) => c.id)).toEqual(["act", "new", "old"]);
  });
});
