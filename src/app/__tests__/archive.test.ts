import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@shared/chat/types";
import {
  collapseRepeatedRemoteBackfill,
  getLastMessagePreview,
  getSidebarMessagePreview,
  mergeArchivedMessages,
  serializeMessagesForState,
  stripInjectedPromptMetadata,
} from "../conversation/archive";
import { assistant, user } from "./fixtures";

describe("stripInjectedPromptMetadata", () => {
  it("removes stacked reminder / prime / multica blocks from the start", () => {
    const text =
      "<rayline-multica-setup>\nctx\n</rayline-multica-setup>\n" +
      "<system-reminder>r</system-reminder>\n" +
      "[Prior conversation context — x]\nUser: a\n[End of prior conversation]\n---\n\nhello";
    expect(stripInjectedPromptMetadata(text)).toBe("hello");
    expect(stripInjectedPromptMetadata("plain")).toBe("plain");
    expect(stripInjectedPromptMetadata(null)).toBe("");
  });
});

describe("serializeMessagesForState", () => {
  it("keeps persisted fields and drops stream bookkeeping / transient state", () => {
    const messages: ChatMessage[] = [
      { id: "u", role: "user", text: "hi", images: [{ dataUrl: "data:x", storagePath: "/s.png", path: "/orig.png" }], claudeUuid: "cu" },
      {
        id: "a",
        role: "assistant",
        isStreaming: true,
        _startedAt: 5,
        _elapsedMs: 9,
        parts: [
          { type: "text", text: "t", _streamKey: "1:0", blockIndex: 0 },
          { type: "tool", id: "t1", name: "Bash", args: { cmd: "ls" }, argsJson: "{}", result: null, status: "running" },
        ],
      },
    ];
    const [u, a] = serializeMessagesForState(messages);
    expect(u).toEqual({
      id: "u",
      role: "user",
      text: "hi",
      images: [{ type: "rayline-stored-image", storagePath: "/s.png", originalPath: "/orig.png" }],
      claudeUuid: "cu",
    });
    expect(a).toEqual({
      id: "a",
      role: "assistant",
      _elapsedMs: 9,
      parts: [
        { type: "text", text: "t" },
        { type: "tool", id: "t1", name: "Bash", args: { cmd: "ls" }, status: "running" },
      ],
    });
  });
});

describe("previews", () => {
  it("sidebar preview joins text parts up to the limit", () => {
    const msg = assistant("a", "hello world");
    expect(getSidebarMessagePreview(msg, 5)).toBe("hello");
    expect(getSidebarMessagePreview(null)).toBeNull();
    expect(getLastMessagePreview([user("u", "x".repeat(80))])).toHaveLength(60);
  });
});

describe("mergeArchivedMessages", () => {
  const a = user("1", "one");
  const b = assistant("2", "two");
  const c = user("3", "three");

  it("appends the non-overlapping tail", () => {
    expect(mergeArchivedMessages([a, b], [b, c]).map((m) => m.id)).toEqual(["1", "2", "3"]);
  });

  it("returns inputs unchanged (same identity) when one side is empty", () => {
    const existing = [a];
    expect(mergeArchivedMessages(existing, [])).toBe(existing);
    const loaded = [b];
    expect(mergeArchivedMessages([], loaded)).toBe(loaded);
  });

  it("prefers the longer list when nothing overlaps", () => {
    expect(mergeArchivedMessages([a], [c, b]).map((m) => m.id)).toEqual(["3", "2"]);
  });
});

describe("collapseRepeatedRemoteBackfill", () => {
  it("collapses N exact copies of the remote list", () => {
    const remote = [user("1", "q"), assistant("2", "r")];
    expect(collapseRepeatedRemoteBackfill([...remote, ...remote, ...remote], remote)).toBe(remote);
    const different = [user("1", "q"), assistant("2", "other")];
    const existing = [...remote, ...different];
    expect(collapseRepeatedRemoteBackfill(existing, remote)).toBe(existing);
  });
});
