import { describe, expect, it } from "vitest";
import { formatThinkingDuration, resolveThinkingSeconds, thinkingSummary } from "../thinking";

describe("thinking helpers", () => {
  it("formats durations", () => {
    expect(formatThinkingDuration(0)).toBe("");
    expect(formatThinkingDuration(42)).toBe("42s");
    expect(formatThinkingDuration(180)).toBe("3m");
    expect(formatThinkingDuration(185)).toBe("3m 5s");
  });

  it("prefers the live ticker while thinking, else the reported duration", () => {
    expect(resolveThinkingSeconds(true, 7, 99_000)).toBe(7);
    expect(resolveThinkingSeconds(false, 7, 2_600)).toBe(3);
    expect(resolveThinkingSeconds(false, 7, undefined)).toBe(7);
    expect(resolveThinkingSeconds(false, 7, Number.NaN)).toBe(7);
  });

  it("summarizes", () => {
    expect(thinkingSummary(true, "")).toBe("Thinking...");
    expect(thinkingSummary(true, "4s")).toBe("Thinking for 4s...");
    expect(thinkingSummary(false, "")).toBe("Thought for a moment");
  });
});
