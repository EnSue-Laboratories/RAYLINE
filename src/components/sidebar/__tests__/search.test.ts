import { describe, expect, it } from "vitest";
import {
  buildConversationSearchVersion,
  buildSearchExcerpt,
  buildSearchKey,
  createSearchRecord,
  getConversationSearchSessionIds,
  getMessageSearchText,
  getSearchTokens,
  matchesSearch,
  matchSearchRecord,
  normalizeSearchText,
} from "../search";
import type { SidebarConversation } from "../types";

const base: SidebarConversation = { id: "c1", title: "Fix Login", model: "sonnet", ts: 100 };

describe("tokenizing and matching", () => {
  it("normalizes whitespace and case", () => {
    expect(normalizeSearchText("  Hello\n  World ")).toBe("hello world");
    expect(getSearchTokens(" Foo  bar ")).toEqual(["foo", "bar"]);
  });

  it("requires every token", () => {
    expect(matchesSearch("hello world", ["hello", "world"])).toBe(true);
    expect(matchesSearch("hello world", ["hello", "mars"])).toBe(false);
    expect(matchesSearch("", ["x"])).toBe(false);
    expect(matchesSearch("", [])).toBe(true);
  });
});

describe("getMessageSearchText", () => {
  it("collects text, command, and part titles/text/results/args", () => {
    const text = getMessageSearchText({
      role: "assistant",
      text: " intro ",
      parts: [
        { type: "text", text: "body" },
        { type: "tool", name: "Bash", args: { command: "ls" }, result: "file.txt" },
        { type: "status", title: "Paused" },
        null,
      ],
    });
    expect(text).toBe('intro\nbody\nfile.txt\n{"command":"ls"}\nPaused');
  });

  it("tolerates junk", () => {
    expect(getMessageSearchText(null)).toBe("");
    expect(getMessageSearchText({ parts: "nope" })).toBe("");
  });
});

describe("search keys", () => {
  it("dedupes session ids", () => {
    expect(
      getConversationSearchSessionIds({ ...base, sessionId: "s1", sessions: [{ nativeSessionId: "s1" }, { nativeSessionId: "s2" }, { nativeSessionId: null }] }),
    ).toEqual(["s1", "s2"]);
  });

  it("ignores streaming preview churn but re-keys when the stream ends", () => {
    const streamingA = { ...base, isStreaming: true, lastPreview: "partial" };
    const streamingB = { ...base, isStreaming: true, lastPreview: "partial answer…" };
    const done = { ...base, isStreaming: false, lastPreview: "final answer" };
    expect(buildSearchKey("q", [streamingA])).toBe(buildSearchKey("q", [streamingB]));
    expect(buildSearchKey("q", [streamingA])).not.toBe(buildSearchKey("q", [done]));
    expect(buildConversationSearchVersion(streamingA)).toBe(buildConversationSearchVersion(streamingB));
  });

  it("re-keys on activity, title, and membership changes", () => {
    const key = buildSearchKey("q", [base]);
    expect(buildSearchKey("q", [{ ...base, ts: 101 }])).not.toBe(key);
    expect(buildSearchKey("q", [{ ...base, updatedAt: 5 }])).not.toBe(key);
    expect(buildSearchKey("q", [{ ...base, title: "Other" }])).not.toBe(key);
    expect(buildSearchKey("q", [base, { ...base, id: "c2" }])).not.toBe(key);
    expect(buildSearchKey("", [base])).toBe("");
  });
});

describe("buildSearchExcerpt", () => {
  it("centres a window on the first hit", () => {
    const text = `${"a ".repeat(100)}needle ${"b ".repeat(100)}`;
    const excerpt = buildSearchExcerpt(text, "needle", ["needle"], 40);
    expect(excerpt.startsWith("…")).toBe(true);
    expect(excerpt.endsWith("…")).toBe(true);
    expect(excerpt).toContain("needle");
  });

  it("falls back to the earliest token, then to a head excerpt", () => {
    expect(buildSearchExcerpt("one two three", "zzz two", ["zzz", "two"], 96)).toBe("one two three");
    expect(buildSearchExcerpt("x".repeat(200), "q", ["q"], 10)).toBe(`${"x".repeat(9)}…`);
    expect(buildSearchExcerpt("   ", "q", ["q"])).toBe("");
  });
});

describe("matchSearchRecord", () => {
  it("returns an excerpt for body hits, null for title-only hits, undefined for misses", () => {
    const record = createSearchRecord({ ...base, lastPreview: "the session token expired" }, ["stack trace here"]);
    expect(matchSearchRecord(record, "token", ["token"])).toBe("the session token expired stack trace here");
    expect(matchSearchRecord(record, "login", ["login"])).toBeNull();
    expect(matchSearchRecord(record, "mars", ["mars"])).toBeUndefined();
  });
});
