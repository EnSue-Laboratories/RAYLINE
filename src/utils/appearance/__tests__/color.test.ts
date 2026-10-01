import { describe, expect, it } from "vitest";
import { expandHex, hexToRgb, inverseFor, isValidHexColor, luminance, mix, rgba, rgbList } from "../color";

describe("expandHex / isValidHexColor", () => {
  it("expands and uppercases 3- and 6-digit hex", () => {
    expect(expandHex("#abc")).toBe("#AABBCC");
    expect(expandHex("  #a1b2c3 ")).toBe("#A1B2C3");
  });

  it("rejects everything else", () => {
    for (const value of ["abc", "#abcd", "#ggg", "", null, undefined, 123, {}]) {
      expect(expandHex(value)).toBeNull();
      expect(isValidHexColor(value)).toBe(false);
    }
  });
});

describe("rgb helpers", () => {
  it("parses channels, treating invalid input as black", () => {
    expect(hexToRgb("#FF8000")).toEqual({ r: 255, g: 128, b: 0 });
    expect(hexToRgb("nope")).toEqual({ r: 0, g: 0, b: 0 });
    expect(rgbList("#fff")).toBe("255, 255, 255");
    expect(rgba("#000", 0.5)).toBe("rgba(0, 0, 0, 0.5)");
  });

  it("mixes linearly", () => {
    expect(mix("#000000", "#FFFFFF")).toBe("#808080");
    expect(mix("#000000", "#FFFFFF", 0)).toBe("#000000");
    expect(mix("#000000", "#FFFFFF", 1)).toBe("#FFFFFF");
  });

  it("computes WCAG luminance and a readable inverse", () => {
    expect(luminance("#000000")).toBe(0);
    expect(luminance("#FFFFFF")).toBeCloseTo(1, 6);
    expect(inverseFor("#FFFFFF")).toBe("#111111");
    expect(inverseFor("#1A1C1F")).toBe("#FFFFFF");
  });
});
