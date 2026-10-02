import { describe, expect, it } from "vitest";
import type { MessagePart } from "@shared/chat/types";
import { groupParts, isHiddenPart, visibleParts } from "../partGroups";

const tool = (id: string): MessagePart => ({ type: "tool", id, name: "Bash", args: {}, status: "done" }) as MessagePart;
const notice: MessagePart = { type: "status", kind: "notice", title: "Notice", text: "loading hooks from both …" };
const text: MessagePart = { type: "text", text: "hi" };

describe("visibleParts", () => {
  it("drops Codex notices and keeps identity when nothing is hidden", () => {
    const clean = [text, tool("a")];
    expect(visibleParts(clean)).toBe(clean);
    expect(visibleParts([notice, text])).toEqual([text]);
    expect(isHiddenPart(notice)).toBe(true);
    expect(isHiddenPart({ type: "status", kind: "paused", text: "" })).toBe(false);
  });

  it("a hidden notice no longer splits a run of tool calls", () => {
    const parts = visibleParts([tool("a"), notice, tool("b"), tool("c")]);
    expect(groupParts(parts, false)).toEqual([{ kind: "tools", start: 0, end: 3 }]);
  });
});
