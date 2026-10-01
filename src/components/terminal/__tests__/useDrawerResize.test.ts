import { describe, expect, it } from "vitest";
import { clampDrawerWidth } from "../useDrawerResize";

describe("clampDrawerWidth", () => {
  it("keeps the drawer between 280px and viewport - 400px", () => {
    expect(clampDrawerWidth(100, 1600)).toBe(280);
    expect(clampDrawerWidth(600, 1600)).toBe(600);
    expect(clampDrawerWidth(1500, 1600)).toBe(1200);
  });
});
