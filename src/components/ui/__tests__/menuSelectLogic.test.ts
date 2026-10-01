import { describe, expect, it } from "vitest";
import { computeAnchoredMenuPosition, edgeActiveIndex, moveActiveIndex, typeaheadIndex } from "../menuSelectLogic";

const viewport = { width: 1200, height: 800 };
const rect = (top: number, left: number, width = 120, height = 28) => ({
  top,
  bottom: top + height,
  left,
  right: left + width,
  width,
});

describe("computeAnchoredMenuPosition", () => {
  it("opens below the trigger, at least as wide as it", () => {
    const pos = computeAnchoredMenuPosition(rect(100, 300), viewport, { estimatedHeight: 200 });
    expect(pos.top).toBe(134);
    expect(pos.left).toBe(300);
    expect(pos.minWidth).toBe(120);
  });

  it("flips above when there is not enough room below", () => {
    const pos = computeAnchoredMenuPosition(rect(700, 300), viewport, { estimatedHeight: 200 });
    expect(pos.top).toBe(700 - 6 - 200);
  });

  it("aligns to the trigger's right edge and clamps into the viewport", () => {
    const end = computeAnchoredMenuPosition(rect(100, 1000, 120), viewport, { minWidth: 220, align: "end" });
    expect(end.left).toBe(1120 - 220);
    const clamped = computeAnchoredMenuPosition(rect(100, 1150, 40), viewport, { minWidth: 200 });
    expect(clamped.left).toBe(1200 - 200 - 8);
  });
});

describe("keyboard helpers", () => {
  const enabled = [true, false, true, true];

  it("moves over disabled options and wraps", () => {
    expect(moveActiveIndex(enabled, 0, 1)).toBe(2);
    expect(moveActiveIndex(enabled, 3, 1)).toBe(0);
    expect(moveActiveIndex(enabled, 0, -1)).toBe(3);
    expect(moveActiveIndex(enabled, -1, 1)).toBe(0);
    expect(moveActiveIndex([false, false], 0, 1)).toBe(-1);
  });

  it("finds first and last enabled options", () => {
    expect(edgeActiveIndex([false, true, true, false], "first")).toBe(1);
    expect(edgeActiveIndex([false, true, true, false], "last")).toBe(2);
  });

  it("type-ahead matches prefixes and cycles on a repeated letter", () => {
    const labels = ["Low", "Medium", "High", "Max"];
    const all = [true, true, true, true];
    expect(typeaheadIndex(labels, all, "h", 0)).toBe(2);
    expect(typeaheadIndex(labels, all, "m", 0)).toBe(1);
    expect(typeaheadIndex(labels, all, "m", 1)).toBe(3);
    expect(typeaheadIndex(labels, all, "mm", 1)).toBe(3);
    expect(typeaheadIndex(labels, all, "ma", 0)).toBe(3);
    expect(typeaheadIndex(labels, all, "zz", 2)).toBe(2);
  });
});
