import { describe, expect, it } from "vitest";
import type { MessagePart, ToolPart } from "@shared/chat/types";
import { splitAttachedPrefix } from "../attachedPrefix";
import { normalizeAssistantImagePart, parseImageFenceBody, resolveMarkdownImgSrc } from "../images";
import { groupParts, summarizeToolNames } from "../partGroups";

const tool = (id: string, name = "Read"): ToolPart => ({ type: "tool", id, name, args: {}, result: null, status: "done" });
const text = (value: string): MessagePart => ({ type: "text", text: value });

describe("groupParts", () => {
  it("collapses runs of 3+ tool calls and leaves shorter runs alone", () => {
    const parts = [text("a"), tool("1"), tool("2"), text("b"), tool("3"), tool("4"), tool("5"), text("c")];
    expect(groupParts(parts, false)).toEqual([
      { kind: "part", index: 0 },
      { kind: "part", index: 1 },
      { kind: "part", index: 2 },
      { kind: "part", index: 3 },
      { kind: "tools", start: 4, end: 7 },
      { kind: "part", index: 7 },
    ]);
  });

  it("keeps the live tail tool outside its group while streaming", () => {
    const parts = [text("a"), tool("1"), tool("2"), tool("3"), tool("4")];
    expect(groupParts(parts, true)).toEqual([
      { kind: "part", index: 0 },
      { kind: "tools", start: 1, end: 4 },
      { kind: "part", index: 4 },
    ]);
    expect(groupParts(parts.slice(0, 4), true).every((item) => item.kind === "part")).toBe(true);
    expect(groupParts(parts, false)).toEqual([{ kind: "part", index: 0 }, { kind: "tools", start: 1, end: 5 }]);
  });

  it("never groups AskUserQuestion (it is interactive)", () => {
    const parts = [tool("1"), tool("2"), tool("q", "AskUserQuestion"), tool("3"), tool("4")];
    expect(groupParts(parts, false).every((item) => item.kind === "part")).toBe(true);
  });

  it("summarizes distinct tool names", () => {
    expect(summarizeToolNames([tool("1", "Read"), tool("2", "Bash"), tool("3", "Read"), tool("4", "Grep"), tool("5", "Edit")])).toEqual({
      names: ["Read", "Bash", "Grep"],
      more: 1,
    });
  });
});

describe("image helpers", () => {
  it("resolves markdown image sources", () => {
    expect(resolveMarkdownImgSrc("https://x/a.png", "a")).toEqual({ src: "https://x/a.png", alt: "a" });
    expect(resolveMarkdownImgSrc("file:///tmp/a%20b.png", "")).toEqual({ src: "", storagePath: "/tmp/a b.png", originalPath: "file:///tmp/a%20b.png", alt: "" });
    expect(resolveMarkdownImgSrc("~/x.png", "")).toMatchObject({ storagePath: "~/x.png" });
    expect(resolveMarkdownImgSrc(undefined, "z")).toEqual({ src: "", alt: "z" });
  });

  it("normalizes assistant image part shapes", () => {
    expect(normalizeAssistantImagePart({ type: "image", source: { type: "base64", media_type: "image/gif", data: "R0" } })).toEqual({
      src: "data:image/gif;base64,R0",
      alt: "",
      mime: "image/gif",
    });
    expect(normalizeAssistantImagePart({ type: "image_url", image_url: { url: "https://i" } })).toEqual({ src: "https://i", alt: "" });
    expect(normalizeAssistantImagePart({ type: "image", src: "https://i", alt: "x", storagePath: "/s" })).toEqual({ src: "https://i", alt: "x", storagePath: "/s" });
    expect(normalizeAssistantImagePart({ type: "image" })).toBeNull();
    expect(normalizeAssistantImagePart("https://bare")).toEqual({ src: "https://bare", alt: "" });
  });

  it("parses ```image fence bodies", () => {
    expect(parseImageFenceBody('{"url":"https://i","alt":"pic"}')).toEqual({ src: "https://i", alt: "pic" });
    expect(parseImageFenceBody(" https://i \n")).toEqual({ src: "https://i", alt: "" });
    expect(parseImageFenceBody("{bad json")).toEqual({ src: "{bad json", alt: "" });
    expect(parseImageFenceBody("  ")).toBeNull();
  });
});

describe("splitAttachedPrefix", () => {
  it("strips the attachment preamble and recovers file chips", () => {
    expect(splitAttachedPrefix("[Attached files:\n/a/b.txt\n/c.md]\n\nhello", undefined)).toEqual({
      displayText: "hello",
      files: [
        { type: "file", name: "b.txt", path: "/a/b.txt" },
        { type: "file", name: "c.md", path: "/c.md" },
      ],
    });
    const files = [{ type: "file" as const, path: "/x" }];
    expect(splitAttachedPrefix("[Attached images: /x]\nhi", files)).toEqual({ displayText: "hi", files });
    expect(splitAttachedPrefix("plain", undefined)).toEqual({ displayText: "plain", files: undefined });
  });
});
