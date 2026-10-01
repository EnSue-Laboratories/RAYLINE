import { describe, expect, it } from "vitest";
import { buildAppearanceCssVariables } from "../cssVariables";
import { APPEARANCE_VERSION, DEFAULT_APPEARANCE } from "../constants";
import { getAppearanceProfile, getAppearanceWindowBackground, normalizeAppearance, normalizeFont } from "../normalize";

describe("normalizeAppearance", () => {
  it("fills defaults for missing or invalid input", () => {
    expect(normalizeAppearance()).toEqual(DEFAULT_APPEARANCE);
    expect(normalizeAppearance("nope")).toEqual(DEFAULT_APPEARANCE);
    expect(normalizeAppearance({ profiles: { dark: { palette: { accent: "red" } } } })).toEqual(DEFAULT_APPEARANCE);
  });

  it("keeps valid custom colors and fonts", () => {
    const result = normalizeAppearance({
      version: APPEARANCE_VERSION,
      profiles: { light: { palette: { accent: "#abc" }, typography: { uiFont: " Inter " } } },
    });
    expect(result.profiles.light.palette.accent).toBe("#AABBCC");
    expect(result.profiles.light.typography.uiFont).toBe("Inter");
  });

  it("migrates legacy default accents only for older versions", () => {
    const legacy = { version: 2, profiles: { dark: { palette: { accent: "#339CFF" } } } };
    expect(normalizeAppearance(legacy).profiles.dark.palette.accent).toBe(DEFAULT_APPEARANCE.profiles.dark.palette.accent);
    const current = { version: APPEARANCE_VERSION, profiles: { dark: { palette: { accent: "#339CFF" } } } };
    expect(normalizeAppearance(current).profiles.dark.palette.accent).toBe("#339CFF");
  });

  it("is idempotent and returns the same object for a normalized input", () => {
    const once = normalizeAppearance({ version: 1 });
    expect(normalizeAppearance(once)).toBe(once);
  });
});

describe("normalizeFont", () => {
  it("rejects CSS injection and overlong stacks", () => {
    expect(normalizeFont("a; color: red", "x")).toBe("x");
    expect(normalizeFont("a{}", "x")).toBe("x");
    expect(normalizeFont("a".repeat(181), "x")).toBe("x");
    expect(normalizeFont("", "x")).toBe("x");
  });
});

describe("profiles and variables", () => {
  it("selects the profile by resolved theme (non-light → dark)", () => {
    expect(getAppearanceProfile(undefined, "light")).toEqual(DEFAULT_APPEARANCE.profiles.light);
    expect(getAppearanceProfile(undefined, "weird")).toEqual(DEFAULT_APPEARANCE.profiles.dark);
    expect(getAppearanceWindowBackground(undefined, "light")).toBe("#F7F4EE");
  });

  it("derives CSS variables from the palette", () => {
    const vars = buildAppearanceCssVariables(DEFAULT_APPEARANCE.profiles.dark, "dark");
    expect(vars["--bg-primary"]).toBe("#0D0D10");
    expect(vars["--pane-background-overlay"]).toBe("rgba(13, 13, 16, 0.82)");
    expect(vars["--text-inverse"]).toBe("#111111");
    expect(vars["--success-text-strong"]).toBe("#88EBB8");
    const light = buildAppearanceCssVariables(DEFAULT_APPEARANCE.profiles.light, "light");
    expect(light["--border"]).toBe("rgba(31, 41, 55, 0.14)");
    expect(light["--term-black"]).toBe("#EEE8D5");
  });

  it("caches variables per profile object and theme", () => {
    const profile = DEFAULT_APPEARANCE.profiles.dark;
    expect(buildAppearanceCssVariables(profile, "dark")).toBe(buildAppearanceCssVariables(profile, "dark"));
    expect(buildAppearanceCssVariables(profile, "light")).not.toBe(buildAppearanceCssVariables(profile, "dark"));
  });
});
