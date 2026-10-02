import { describe, expect, it } from "vitest";
import { normalizeEffortByModel, rememberEffort, rememberedEffort } from "../effortMemory";

describe("effort memory", () => {
  const model = { efforts: ["low", "medium", "high", "xhigh", "max"] as const };

  it("remembers per model and forgets on default", () => {
    const m1 = rememberEffort({}, "gpt-6.1-sol", "high");
    expect(rememberedEffort(m1, "gpt-6.1-sol", { efforts: [...model.efforts] })).toBe("high");
    expect(rememberEffort(m1, "gpt-6.1-sol", "high")).toBe(m1);
    expect(rememberEffort(m1, "gpt-6.1-sol", null)).toEqual({});
  });

  it("ignores a remembered level the model no longer supports", () => {
    const memory = rememberEffort({}, "opus", "ultra");
    expect(rememberedEffort(memory, "opus", { efforts: [...model.efforts] })).toBeNull();
    expect(rememberedEffort(memory, "opus", null)).toBeNull();
  });

  it("normalizes legacy ids and drops junk when loading", () => {
    expect(normalizeEffortByModel({ "gpt55-high": "high", sonnet: "bogus", 3: 4 })).toEqual({ "gpt-5.5": "high" });
    expect(normalizeEffortByModel(null)).toEqual({});
  });

  it("stays bounded", () => {
    let memory = {};
    for (let i = 0; i < 100; i += 1) memory = rememberEffort(memory, `m${i}`, "low");
    expect(Object.keys(memory)).toHaveLength(64);
    expect(Object.keys(memory)).toContain("m99");
  });
});
