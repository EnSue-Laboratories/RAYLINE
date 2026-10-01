import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GitStatus } from "@shared/git/types";
import { resetDraftCacheForTests } from "../../../utils/composerDrafts";
import { composerDraftScope, matchSlashCommands, readComposerDraft, writeComposerDraft } from "../composerDraft";
import { branchAttention, expandWindowStart, isDraftContext, resolveWindowStart, scrollTopAfterPrepend, shellLocationLabel, WINDOW_SIZE, WINDOW_STEP } from "../logic";

describe("transcript windowing", () => {
  it("starts with the last WINDOW_SIZE messages once there are messages", () => {
    expect(resolveWindowStart(null, 0)).toBeNull();
    expect(resolveWindowStart(null, 10)).toBe(0);
    expect(resolveWindowStart(null, 100)).toBe(100 - WINDOW_SIZE);
  });

  it("keeps the anchor while messages are appended (nothing above unmounts)", () => {
    const anchor = resolveWindowStart(null, 100);
    expect(resolveWindowStart(anchor, 101)).toBe(anchor);
    expect(resolveWindowStart(anchor, 250)).toBe(anchor);
  });

  it("resets when the list shrinks past the anchor (rewind / clear / compact)", () => {
    expect(resolveWindowStart(60, 30)).toBe(0);
    expect(resolveWindowStart(60, 60)).toBe(60 - WINDOW_SIZE);
    expect(resolveWindowStart(60, 61)).toBe(60);
  });

  it("prepends WINDOW_STEP at a time, never below zero", () => {
    expect(expandWindowStart(100)).toBe(100 - WINDOW_STEP);
    expect(expandWindowStart(10)).toBe(0);
    expect(expandWindowStart(null)).toBe(0);
  });

  it("compensates scrollTop by the height added above", () => {
    expect(scrollTopAfterPrepend(20, 1000, 1800)).toBe(820);
    expect(scrollTopAfterPrepend(20, 1000, 900)).toBe(20);
  });
});

describe("header / composer derivations", () => {
  it("treats no-cwd and drafts-path conversations as drafts", () => {
    expect(isDraftContext(null, "/d")).toBe(true);
    expect(isDraftContext("/d/.worktrees/x", "/d")).toBe(true);
    expect(isDraftContext("/repo", "/d")).toBe(false);
    expect(isDraftContext("/repo", null)).toBe(false);
  });

  it("flags dirty or unpublished branches", () => {
    const dirtyFile = { path: "a", index: ".", worktree: "M" };
    const base: GitStatus = { branch: "feat", upstream: "origin/feat", ahead: 0, behind: 0, files: [], detached: false };
    expect(branchAttention(base)).toEqual({ needsAttention: false, hintKey: "chatArea.branchWarnNoUpstream" });
    expect(branchAttention({ ...base, upstream: null })).toEqual({ needsAttention: true, hintKey: "chatArea.branchWarnNoUpstream" });
    expect(branchAttention({ ...base, files: [dirtyFile] })).toMatchObject({ needsAttention: true, hintKey: "chatArea.branchWarnDirty" });
    expect(branchAttention({ ...base, upstream: null, files: [dirtyFile] }).hintKey).toBe("chatArea.branchWarnBoth");
    expect(branchAttention({ ...base, upstream: null, detached: true }).needsAttention).toBe(false);
    expect(branchAttention(null).needsAttention).toBe(false);
  });

  it("labels the shell location", () => {
    expect(shellLocationLabel("/Users/me/repo/.worktrees/feat")).toBe("repo / feat");
    expect(shellLocationLabel("/Users/me/repo")).toBe("me/repo");
    expect(shellLocationLabel(null)).toBe("current workspace");
  });

  it("matches slash commands only before the first space", () => {
    expect(matchSlashCommands("/c")).toEqual(["/clear", "/compact"]);
    expect(matchSlashCommands("/N")).toEqual(["/new"]);
    expect(matchSlashCommands("/clear now")).toEqual([]);
    expect(matchSlashCommands("hi")).toEqual([]);
  });
});

describe("composer drafts", () => {
  beforeEach(() => {
    resetDraftCacheForTests();
    const map = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => map.set(key, value),
      removeItem: (key: string) => map.delete(key),
    });
  });

  it("scopes drafts per conversation, else per workspace", () => {
    expect(composerDraftScope("c1", "/w")).toBe("conversation:c1");
    expect(composerDraftScope(null, "/w")).toBe("pending:workspace:/w");
    expect(composerDraftScope(null, null)).toBe("pending:workspace:default");
  });

  it("round-trips text and valid attachments only; empty drafts clear", () => {
    writeComposerDraft("s", "你好\n  draft", [{ type: "file", path: "/a" }]);
    resetDraftCacheForTests();
    expect(readComposerDraft("s")).toEqual({ text: "你好\n  draft", attachments: [{ type: "file", path: "/a" }] });
    writeComposerDraft("s", "", []);
    resetDraftCacheForTests();
    expect(readComposerDraft("s")).toEqual({ text: "", attachments: [] });
  });
});
