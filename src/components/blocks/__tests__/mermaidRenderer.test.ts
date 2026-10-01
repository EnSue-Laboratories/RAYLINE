import { describe, expect, it } from "vitest";
import { getMermaidHeight, mermaidCacheKey, peekMermaidSvg, rememberMermaidHeight } from "../mermaidRenderer";

describe("mermaid renderer cache", () => {
  it("keys by epoch, mode and code", () => {
    const a = mermaidCacheKey("graph TD; A-->B", "dark", 0);
    expect(a).not.toBe(mermaidCacheKey("graph TD; A-->B", "light", 0));
    expect(a).not.toBe(mermaidCacheKey("graph TD; A-->B", "dark", 1));
    expect(peekMermaidSvg(a)).toBeUndefined();
  });

  it("remembers heights with an LRU bound", () => {
    rememberMermaidHeight("code-0", 0);
    expect(getMermaidHeight("code-0")).toBeUndefined();
    for (let i = 0; i < 70; i += 1) rememberMermaidHeight(`code-${i}`, 100 + i);
    expect(getMermaidHeight("code-0")).toBeUndefined();
    expect(getMermaidHeight("code-69")).toBe(169);
  });
});
