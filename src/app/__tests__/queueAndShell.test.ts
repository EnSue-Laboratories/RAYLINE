import { describe, expect, it } from "vitest";
import { isQueuedMessageReleaseBoundary, normalizeQueuedMessage } from "../conversation/queue";
import { cleanTerminalShellOutput, formatShellResult } from "../shell/shellCommand";
import { deriveConversationTitle } from "../conversation/titles";

describe("queued messages", () => {
  it("normalizes persisted entries and their attachments", () => {
    const entry = normalizeQueuedMessage({
      id: "q1",
      conversationId: "c",
      text: "hi",
      queuedAt: 5,
      attachments: [{ type: "image", dataUrl: "data:x", name: "a.png" }, { type: "file", path: "/f" }, { type: "bogus" }],
    });
    expect(entry).toEqual({
      id: "q1",
      conversationId: "c",
      text: "hi",
      queuedAt: 5,
      attachments: [{ type: "image", dataUrl: "data:x", name: "a.png" }, { type: "file", path: "/f" }],
    });
    expect(normalizeQueuedMessage({ text: "no convo" })).toBeNull();
    expect(normalizeQueuedMessage({ conversationId: "c", text: "x" })?.id).toMatch(/^queue-/);
  });

  it("detects tool / turn boundaries across providers", () => {
    expect(isQueuedMessageReleaseBoundary({ type: "user", message: { content: [{ type: "tool_result" }] } })).toBe(true);
    expect(isQueuedMessageReleaseBoundary({ type: "result" })).toBe(true);
    expect(isQueuedMessageReleaseBoundary({ type: "item.completed", item: { type: "command_execution" } })).toBe(true);
    expect(isQueuedMessageReleaseBoundary({ type: "response_item", payload: { type: "function_call_output" } })).toBe(true);
    expect(isQueuedMessageReleaseBoundary({ type: "event_msg", payload: { type: "task_complete" } })).toBe(true);
    expect(isQueuedMessageReleaseBoundary({ type: "assistant" })).toBe(false);
    expect(isQueuedMessageReleaseBoundary(null)).toBe(false);
  });
});

describe("shell mode", () => {
  it("strips ANSI codes and the exit-marker helper lines", () => {
    const marker = "__CLAUDI_SHELL_EXIT__1_abc";
    const raw = `\u001b[32mhello\u001b[0m\n__claudi_exit_code=$?\nprintf '${marker}:%s\\n' "$__claudi_exit_code"\n${marker}:0`;
    expect(cleanTerminalShellOutput(raw, marker)).toBe("hello");
  });

  it("formats output, errors and empty output in fences", () => {
    expect(formatShellResult({ ok: true, command: "ls", stdout: "a", stderr: "" })).toBe("````text\na\n````");
    expect(formatShellResult({ ok: false, command: "ls", error: "boom" })).toBe("````text\nboom\n````");
    expect(formatShellResult({ ok: true, command: "ls" })).toBe("````text\n(no output)\n````");
  });

  it("derives titles from text, else attachments", () => {
    expect(deriveConversationTitle("  hello  ")).toBe("hello");
    expect(deriveConversationTitle("", [{ type: "image", dataUrl: "d", name: "pic.png" }, { type: "file", path: "/x" }])).toBe("pic.png +1");
    expect(deriveConversationTitle("")).toBe("New chat");
  });
});
