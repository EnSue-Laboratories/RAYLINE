import { describe, expect, it } from "vitest";
import { getPaneInteractionStyle, getPaneSurfaceStyle } from "../paneSurface";

describe("getPaneSurfaceStyle", () => {
  it("returns the same frozen object for the same inputs", () => {
    const a = getPaneSurfaceStyle(true);
    expect(getPaneSurfaceStyle(true, {})).toBe(a);
    expect(Object.isFrozen(a)).toBe(true);
    expect(getPaneSurfaceStyle(false)).not.toBe(a);
  });

  it("uses wallpaper-specific defaults and clamps opacities", () => {
    expect(getPaneSurfaceStyle(false)["--pane-interaction-hover"]).toBe("var(--pane-hover)");
    expect(getPaneSurfaceStyle(true)["--pane-hover"]).toBe(
      "color-mix(in srgb, var(--text-primary) 2.000%, transparent)",
    );
    expect(getPaneSurfaceStyle(false, { activeOpacity: 500 })["--pane-interaction-active"]).toBe(
      "color-mix(in srgb, var(--text-primary) 100.000%, transparent)",
    );
  });
});

describe("getPaneInteractionStyle", () => {
  it("maps unknown states to idle", () => {
    expect(getPaneInteractionStyle("hover").background).toContain("--pane-interaction-hover-fill");
    expect(getPaneInteractionStyle("bogus")).toBe(getPaneInteractionStyle("idle"));
  });
});
