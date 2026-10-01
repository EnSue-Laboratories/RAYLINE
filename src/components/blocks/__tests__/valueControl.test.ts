import { describe, expect, it } from "vitest";
import {
  buildControlSubmitText,
  controlOptionLabel,
  controlValue,
  fillTemplate,
  formatNumber,
  normalizeControlBlock,
  roundToStep,
  sliderValueAtRatio,
  sliderValueForKey,
  valueFieldWidth,
} from "../valueControl";

describe("normalizeControlBlock", () => {
  it("rejects invalid input", () => {
    expect(() => normalizeControlBlock("[]")).toThrow("Control block must be a JSON object.");
    expect(() => normalizeControlBlock('{"type":"slider"}')).toThrow("Unsupported control type: slider");
    expect(() => normalizeControlBlock("{")).toThrow();
  });

  it("builds a continuous config with defaults and clamping", () => {
    const { control, config } = normalizeControlBlock('{"type":"value_control","min":0,"max":10,"step":0.5,"value":12.3}');
    expect(control.label).toBe("Value");
    expect(control.actionLabel).toBe("Send");
    expect(config).toMatchObject({ mode: "continuous", min: 0, max: 10, step: 0.5, initial: 10 });
    expect(controlValue(config, 15)).toBe(10);
    expect(controlOptionLabel(config, 3)).toBeNull();
  });

  it("builds a discrete config choosing the nearest option", () => {
    const json = JSON.stringify({
      type: "value_control",
      mode: "discrete",
      value: 7,
      options: [1, "5", { value: 8, label: "High" }, { value: "x" }, null],
    });
    const { config } = normalizeControlBlock(json);
    expect(config.mode).toBe("discrete");
    if (config.mode !== "discrete") return;
    expect(config.options.map((o) => o.label)).toEqual(["1", "5", "High"]);
    expect(config.initial).toBe(2);
    expect(controlValue(config, 1.4)).toBe(5);
    expect(controlOptionLabel(config, 9)).toBe("High");
  });

  it("falls back to continuous when discrete options are empty", () => {
    const { config } = normalizeControlBlock('{"type":"value_control","mode":"discrete","options":[]}');
    expect(config.mode).toBe("continuous");
  });
});

describe("value math", () => {
  it("rounds to step from the origin", () => {
    expect(roundToStep(0.36, 0.25, 0.1)).toBe(0.35);
    expect(roundToStep(7, 0, 0)).toBe(7);
  });

  it("maps keys and pointer ratios", () => {
    expect(sliderValueForKey("ArrowRight", 5, 0, 10, 1)).toBe(6);
    expect(sliderValueForKey("PageDown", 5, 0, 10, 1)).toBe(1);
    expect(sliderValueForKey("End", 5, 0, 10, 1)).toBe(10);
    expect(sliderValueForKey("a", 5, 0, 10, 1)).toBeNull();
    expect(sliderValueAtRatio(0.42, 0, 10, 1)).toBe(4);
    expect(sliderValueAtRatio(2, 0, 10, 1)).toBe(10);
  });

  it("formats numbers and field width", () => {
    expect(formatNumber(3)).toBe("3");
    expect(formatNumber(3.1)).toBe("3.1");
    expect(formatNumber(3.456)).toBe("3.46");
    expect(valueFieldWidth("1")).toBe("3ch");
    expect(valueFieldWidth("123456789")).toBe("5.5ch");
  });

  it("fills templates and builds submit text", () => {
    expect(fillTemplate("{{ a }}-{{b}}-{{c}}", { a: 1, b: "x" })).toBe("1-x-");
    const { control, config } = normalizeControlBlock('{"type":"value_control","label":"Temp","unit":"°"}');
    expect(buildControlSubmitText(control, config, 21.5, 21.5, false)).toBe("Set Temp to 21.5°.");
    expect(buildControlSubmitText(control, config, 21, 21, true)).toContain("saved Temp at 21°");
  });
});
