import { describe, expect, it } from "vitest";
import { clamp, getFloatingMenuLayout } from "../floatingMenu";

const viewport = { width: 1000, height: 800 };

describe("getFloatingMenuLayout", () => {
  it("opens below the anchor when there is room", () => {
    expect(getFloatingMenuLayout({ top: 100, bottom: 130, left: 50 }, 340, 300, viewport)).toEqual({
      top: 136, left: 50, width: 340, maxHeight: 300,
    });
  });

  it("flips above when the space below is too small", () => {
    const layout = getFloatingMenuLayout({ top: 700, bottom: 730, left: 50 }, 340, 300, viewport);
    expect(layout.top).toBe(700 - 6 - 300);
  });

  it("keeps the menu inside a narrow viewport", () => {
    const layout = getFloatingMenuLayout({ top: 10, bottom: 40, left: 290 }, 340, 300, { width: 300, height: 200 });
    expect(layout.width).toBe(284);
    expect(layout.left).toBe(8);
    expect(layout.maxHeight).toBe(184);
  });

  it("clamp tolerates inverted bounds", () => {
    expect(clamp(5, 10, 0)).toBe(10);
    expect(clamp(5, 0, 3)).toBe(3);
  });
});
