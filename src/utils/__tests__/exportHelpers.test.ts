import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@shared/chat/types";
import {
  buildExportBaseFileName,
  conversationToJson,
  conversationToMarkdown,
  extractAssistantMarkdown,
  messageToMarkdown,
  sanitizeFileNamePart,
  serializeMessageParts,
} from "../exportHelpers";

const NOW = new Date("2026-10-01T12:00:00.000Z");

const msgs: ChatMessage[] = [
  { id: "u1", role: "user", text: "[Attached files:\n/tmp/a.txt]\n\nPlease review" },
  {
    id: "a1",
    role: "assistant",
    parts: [
      { type: "thinking", text: "hmm" },
      { type: "text", text: "Looks good." },
      { type: "image", src: "data:image/png;base64,AA", alt: "chart [1]" },
      { type: "tool", id: "t1", name: "Read", args: { file_path: "/a" }, result: "body", status: "done" },
    ],
  },
  { id: "s1", role: "system", text: "exit 0", mode: "shell-result" },
  { id: "a2", role: "assistant", parts: [] },
];

describe("exportHelpers", () => {
  it("sanitizes file name parts", () => {
    expect(sanitizeFileNamePart("  My Chat: v2! ", "x")).toBe("my-chat-v2");
    expect(sanitizeFileNamePart("", "fallback")).toBe("fallback");
    expect(buildExportBaseFileName({ title: "Hello World", id: "c1234567890123456" })).toBe("hello-world-c12345678901");
    expect(buildExportBaseFileName(null)).toBe("conversation-export");
  });

  it("renders messages as markdown", () => {
    expect(messageToMarkdown(msgs[0])).toBe("Please review");
    expect(extractAssistantMarkdown(msgs[1])).toBe("Looks good.\n![chart 1](data:image/png;base64,AA)");
    expect(messageToMarkdown(msgs[3])).toBe("");
  });

  it("exports a conversation to markdown", () => {
    const md = conversationToMarkdown({ title: "T", model: "sonnet", msgs }, NOW);
    expect(md).toContain("# T\n\n- Model: sonnet\n- Messages: 4\n- Exported: 2026-10-01T12:00:00.000Z");
    expect(md).toContain("## User\n\nPlease review\n");
    expect(md).toContain("## System\n\nexit 0");
    expect(md.endsWith("exit 0\n")).toBe(true);
  });

  it("exports a conversation to JSON including tool input/output", () => {
    const json = conversationToJson({ id: "c1", title: "T", model: "sonnet", cwd: "/repo", msgs }, NOW);
    expect(json).toMatchObject({ exportedAt: NOW.toISOString(), id: "c1", cwd: "/repo", messageCount: 4 });
    expect(json.messages[1]?.parts?.[3]).toEqual({
      type: "tool", id: "t1", name: "Read", input: { file_path: "/a" }, output: "body", status: "done",
    });
    expect(json.messages[0]?.parts).toBeNull();
    expect(serializeMessageParts(undefined)).toBeNull();
  });
});
