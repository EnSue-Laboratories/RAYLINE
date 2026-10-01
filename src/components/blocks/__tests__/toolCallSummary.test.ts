import { describe, expect, it } from "vitest";
import {
  BODY_PREVIEW_LIMIT,
  BODY_REVEAL_STEP,
  buildToolBodyView,
  getToolLabel,
  getToolPreview,
  nextVisibleLimit,
  redactSensitiveText,
  serializeToolValue,
} from "../toolCallSummary";

describe("getToolLabel", () => {
  it("falls back to Tool and detects shell-ish names", () => {
    expect(getToolLabel(null)).toBe("Tool");
    expect(getToolLabel({ name: "ls -la", args: { command: "ls -la" } })).toBe("Command");
    expect(getToolLabel({ name: "/bin/zsh -lc 'npm test'", args: {} })).toBe("Command");
    expect(getToolLabel({ name: "[bg] npm run dev", args: {} })).toBe("Command");
    expect(getToolLabel({ name: "Execute `ls`", args: {} })).toBe("Command");
    expect(getToolLabel({ name: "multi\nline", args: {} })).toBe("Command");
    expect(getToolLabel({ name: "Read", args: {} })).toBe("Read");
  });

  it("shortens very long names", () => {
    expect(getToolLabel({ name: `mcp__server: ${"x".repeat(90)}`, args: {} })).toBe("mcp__server");
    expect(getToolLabel({ name: "y".repeat(81), args: {} })).toBe("Tool");
  });
});

describe("getToolPreview", () => {
  it("strips binary paths from Bash commands and truncates", () => {
    expect(getToolPreview({ name: "Bash", args: { command: "/usr/local/bin/node script.js" } })).toBe("node script.js");
    const long = getToolPreview({ name: "Bash", args: { command: "echo " + "a".repeat(100) } });
    expect(long?.endsWith("...")).toBe(true);
    expect(long?.length).toBe(33);
  });

  it("previews file paths and search patterns", () => {
    expect(getToolPreview({ name: "Read", args: { file_path: "/a/b/c.ts" } })).toBe("c.ts");
    expect(getToolPreview({ name: "Write", args: { file_path: "/a/b/c.ts" } })).toBe("b/c.ts");
    expect(getToolPreview({ name: "Grep", args: { query: "needle" } })).toBe("needle");
    expect(getToolPreview({ name: "Skill", args: { name: "pdf" } })).toBe("pdf");
    expect(getToolPreview({ name: "Unknown", args: {} })).toBeNull();
  });

  it("ignores non-string command args instead of throwing", () => {
    expect(getToolPreview({ name: "Bash", args: { command: ["ls"] } })).toBe(null);
  });

  it("redacts secrets in previews", () => {
    expect(getToolPreview({ name: "WebFetch", args: { url: "sk-abcdefghijklmnopqrstu" } })).toBe("[redacted-key]");
  });
});

describe("redactSensitiveText", () => {
  it("masks keys, bearer tokens and key=value secrets", () => {
    expect(redactSensitiveText("Authorization: Bearer abc.def")).toBe("Authorization: Bearer [redacted-token]");
    expect(redactSensitiveText('api_key="0123456789abcdef0123"')).toBe('api_key="[redacted-secret]"');
    expect(redactSensitiveText("nothing here")).toBe("nothing here");
    expect(redactSensitiveText(null)).toBeNull();
  });
});

describe("tool bodies", () => {
  it("serializes values compactly", () => {
    expect(serializeToolValue(null)).toBeNull();
    expect(serializeToolValue("")).toBeNull();
    expect(serializeToolValue({ a: 1 })).toBe('{"a":1}');
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(serializeToolValue(circular)).toBe("[object Object]");
  });

  it("reveals large bodies incrementally without losing content", () => {
    const body = "x".repeat(BODY_PREVIEW_LIMIT * 20);
    const first = buildToolBodyView(body, BODY_PREVIEW_LIMIT);
    expect(first.isTrimmed).toBe(true);
    expect(first.text.length).toBe(BODY_PREVIEW_LIMIT);
    expect(first.remaining).toBe(body.length - BODY_PREVIEW_LIMIT);

    let limit = BODY_PREVIEW_LIMIT;
    limit = nextVisibleLimit(body.length, limit);
    expect(limit).toBe(BODY_PREVIEW_LIMIT + BODY_REVEAL_STEP);
    while (buildToolBodyView(body, limit).remaining > 0) limit = nextVisibleLimit(body.length, limit);
    expect(buildToolBodyView(body, limit).text).toBe(body);
    expect(nextVisibleLimit(body.length, limit)).toBe(BODY_PREVIEW_LIMIT);
  });

  it("does not trim short bodies", () => {
    const view = buildToolBodyView("short", BODY_PREVIEW_LIMIT);
    expect(view).toEqual({ text: "short", isTrimmed: false, remaining: 0 });
  });
});
