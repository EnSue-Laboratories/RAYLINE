import { describe, expect, it } from "vitest";
import type { AssistantMessage, ChatMessage } from "@shared/chat/types";
import {
  conversationFileName,
  settingsOnly,
  splitLegacyState,
  truncateArchivedMessages,
  truncatePayload,
  truncateString,
} from "./state-transform";

describe("truncateString", () => {
  it("keeps short strings and marks dropped bytes", () => {
    expect(truncateString("abc", 5)).toBe("abc");
    expect(truncateString("abcdefgh", 5)).toBe("abcde…[truncated 3 bytes]");
  });

  it("counts UTF-8 bytes and never splits a surrogate pair", () => {
    const text = `aaaa${"😀"}bbbb`;
    const out = truncateString(text, 5);
    expect(out.startsWith("aaaa…")).toBe(true);
    expect(out).toBe("aaaa…[truncated 8 bytes]");
  });

  it("is idempotent", () => {
    const once = truncateString("z".repeat(100), 10);
    expect(truncateString(once, 10)).toBe(once);
  });
});

describe("truncatePayload", () => {
  it("truncates nested string leaves copy-on-write", () => {
    const short = { keep: "ok" };
    const value = { short, list: ["x".repeat(20), 3] };
    const out = truncatePayload(value, 10) as { short: unknown; list: unknown[] };
    expect(out).not.toBe(value);
    expect(out.short).toBe(short);
    expect(out.list[0]).toBe(`${"x".repeat(10)}…[truncated 10 bytes]`);
    expect(out.list[1]).toBe(3);
    expect(truncatePayload(short, 10)).toBe(short);
  });
});

describe("truncateArchivedMessages", () => {
  it("only touches tool parts and preserves identity when nothing changes", () => {
    const user: ChatMessage = { id: "u", role: "user", text: "y".repeat(50_000) };
    const assistant: AssistantMessage = {
      id: "a",
      role: "assistant",
      parts: [
        { type: "text", text: "t".repeat(50_000) },
        { type: "tool", id: "t", name: "Read", args: { path: "p".repeat(40) }, result: "r".repeat(40), status: "done" },
      ],
    };
    const messages = [user, assistant];
    expect(truncateArchivedMessages(messages, 100)).toBe(messages);

    const out = truncateArchivedMessages(messages, 10);
    expect(out[0]).toBe(user);
    const parts = (out[1] as AssistantMessage).parts ?? [];
    expect(parts[0]).toBe(assistant.parts?.[0]);
    expect(parts[1]).toMatchObject({ result: `${"r".repeat(10)}…[truncated 30 bytes]`, args: { path: `${"p".repeat(10)}…[truncated 30 bytes]` } });
  });
});

describe("conversationFileName", () => {
  it("encodes ids so they cannot escape the directory", () => {
    expect(conversationFileName("convo-123_abc")).toBe("convo-123_abc.json");
    expect(conversationFileName("../evil")).toBe("%2E%2E%2Fevil.json");
    expect(conversationFileName("a/b")).toBe("a%2Fb.json");
  });
});

describe("splitLegacyState / settingsOnly", () => {
  it("separates metadata from transcripts", () => {
    const { index, transcripts } = splitLegacyState({
      locale: "en-US",
      convos: [
        {
          id: "a",
          title: "A",
          model: "m",
          ts: 1,
          sessions: [],
          activeSessionId: null,
          providerSessions: {},
          sessionId: null,
          sessionProvider: null,
          archivedMessages: [{ id: "u", role: "user", text: "hi" }],
        },
      ],
    });
    expect(index).toMatchObject({ version: 2, locale: "en-US" });
    expect("archivedMessages" in (index.convos[0] ?? {})).toBe(false);
    expect(transcripts).toEqual([{ id: "a", archivedMessages: [{ id: "u", role: "user", text: "hi" }] }]);
    expect(settingsOnly(index)).toEqual({ locale: "en-US" });
  });
});

describe("normalizeTranscriptImages", () => {
  it("keeps canonical stored refs by identity and rewrites inline images", async () => {
    const { normalizeTranscriptImages } = await import("./message-images");
    const stored = { type: "rayline-stored-image" as const, storagePath: "/x/a.png", mime: "image/png" };
    const messages: ChatMessage[] = [{ id: "u", role: "user", text: "", images: [stored] }];
    expect(normalizeTranscriptImages(messages, () => null)).toBe(messages);

    const inline: ChatMessage[] = [{ id: "u", role: "user", text: "", images: ["data:image/png;base64,AAAA", { dataUrl: "data:x", storagePath: "/x/b.png", name: "b" }] }];
    const out = normalizeTranscriptImages(inline, () => ({ storagePath: "/x/c.png", mime: "image/png" }));
    expect(out[0]).toEqual({
      id: "u",
      role: "user",
      text: "",
      images: [
        { type: "rayline-stored-image", storagePath: "/x/c.png", mime: "image/png" },
        { type: "rayline-stored-image", storagePath: "/x/b.png", name: "b" },
      ],
    });
  });
});
