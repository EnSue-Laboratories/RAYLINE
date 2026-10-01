import { describe, expect, it } from "vitest";
import { CAPTURE_BACKGROUND, buildCaptureLayout } from "../captureImage";

describe("buildCaptureLayout", () => {
  it("pads the content and uses the gradient without a wallpaper", () => {
    const layout = buildCaptureLayout(600, 400, null);
    expect(layout.width).toBe(648);
    expect(layout.height).toBe(438);
    expect(layout.style.background).toBe(CAPTURE_BACKGROUND);
    expect(layout.style.width).toBe("600px");
  });

  it("darkens the wallpaper more as its opacity drops", () => {
    const opaque = buildCaptureLayout(10, 10, { dataUrl: "data:x", imgOpacity: 100 });
    const faint = buildCaptureLayout(10, 10, { dataUrl: "data:x", imgOpacity: 0 });
    expect(opaque.style.backgroundImage).toContain("rgba(13,13,16,0.68)");
    expect(faint.style.backgroundImage).toContain("rgba(13,13,16,0.93)");
    expect(faint.style.backgroundImage).toContain("url(data:x)");
    expect(faint.style.background).toBeUndefined();
  });
});
