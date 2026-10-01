import { describe, expect, it } from "vitest";
import { buildInteractiveSrcdoc, clampIframeHeight, readIframeResizeHeight } from "../interactiveDoc";

describe("interactive iframe document", () => {
  it("embeds code, theme and tokens", () => {
    const doc = buildInteractiveSrcdoc("<svg id=x></svg>", "light", { bg: "#fff", fg: "#000", line: "#ccc", fontUi: "Inter" });
    expect(doc).toContain('<html data-theme="light">');
    expect(doc).toContain("--bg: #fff;");
    expect(doc).toContain("<svg id=x></svg>");
    expect(doc).toContain("type: 'iframe-resize'");
  });

  it("parses resize messages and clamps the height", () => {
    expect(readIframeResizeHeight({ type: "iframe-resize", height: 120 })).toBe(120);
    expect(readIframeResizeHeight({ type: "other", height: 120 })).toBeNull();
    expect(readIframeResizeHeight({ type: "iframe-resize", height: "a" })).toBeNull();
    expect(readIframeResizeHeight(null)).toBeNull();
    expect(clampIframeHeight(100)).toBe(104);
    expect(clampIframeHeight(5000)).toBe(800);
  });
});
