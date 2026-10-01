import { describe, expect, it } from "vitest";
import {
  LEGACY_MODEL_ALIASES,
  STATIC_MODELS,
  buildCodexRuntimeModelId,
  getMOrMulticaFallback,
  normalizeModelId,
  normalizeModelSelection,
  type EffortLevel,
  type ModelSelection,
} from "..";

function sel(id: string, effort: EffortLevel | null = null, grokContinue = false): ModelSelection {
  return grokContinue ? { id, effort, grokContinue: true } : { id, effort };
}

describe("normalizeModelSelection — RayLine legacy ids", () => {
  it.each<[string, ModelSelection]>([
    ["gpt55-med", sel("gpt-5.5", "medium")],
    ["gpt55-high", sel("gpt-5.5", "high")],
    ["gpt55-xhigh", sel("gpt-5.5", "xhigh")],
    ["gpt54-med", sel("gpt-6-astra", "medium")],
    ["gpt54-high", sel("gpt-6-astra", "high")],
    ["gpt54-xhigh", sel("gpt-6-astra", "xhigh")],
    ["gpt-5.4", sel("gpt-6-astra")],
    ["claude-opus", sel("opus")],
    ["claude-sonnet", sel("sonnet")],
    ["remote-ssh:codex:gpt55-high", sel("remote-ssh:codex:gpt-5.5", "high")],
    ["remote-ssh:claude:claude-opus", sel("remote-ssh:claude:opus")],
  ])("%s", (id, expected) => {
    expect(normalizeModelSelection(id)).toEqual(expected);
  });
});

describe("normalizeModelSelection — PR #230 ids", () => {
  it.each<[string, ModelSelection]>([
    // codexModelId() for known families
    ["gpt6-astra-med", sel("gpt-6-astra", "medium")],
    ["gpt6-astra-ultra", sel("gpt-6-astra", "ultra")],
    ["gpt6-sol-ultra", sel("gpt-6-sol", "ultra")],
    ["gpt6-luna-max", sel("gpt-6-luna", "max")],
    ["gpt56-sol-low", sel("gpt-5.6-sol", "low")],
    ["gpt56-terra-high", sel("gpt-5.6-terra", "high")],
    ["gpt56-luna-xhigh", sel("gpt-5.6-luna", "xhigh")],
    ["gpt61-sol-high", sel("gpt-6.1-sol", "high")],
    ["gpt6-terra-high", sel(buildCodexRuntimeModelId("gpt-6-terra"), "high")],
    // codexModelId() for plain slugs
    ["gpt55-low", sel("gpt-5.5", "low")],
    ["gpt54-max", sel("gpt-6-astra", "max")],
    // codex-model:<slug>:<effort>
    ["codex-model:gpt-6.1-sol:none", sel("gpt-6.1-sol", "medium")],
    ["codex-model:gpt-6.1-sol:high", sel("gpt-6.1-sol", "high")],
    ["codex-model:gpt-6.1-sol:minimal", sel("gpt-6.1-sol", "low")],
    ["codex-model:future-model:high", sel("codex-model:future-model", "high")],
    ["codex-model:future-model:none", sel("codex-model:future-model")],
    ["codex-model:org%2Fslug%3Av2:xhigh", sel("codex-model:org%2Fslug%3Av2", "xhigh")],
    ["codex-model:gpt-6-astra", sel("gpt-6-astra")],
    // Claude
    ["sonnet-1m", sel("sonnet")],
    // Grok compact ids
    ["grok-47", sel("grok-4.7")],
    ["grok-46", sel("grok-4.6")],
    ["grok-46-continue", sel("grok-4.6", null, true)],
    ["grok-46-direct", sel("grok-4.6-direct")],
    ["grok-46-public", sel("grok-4.6-public")],
    ["grok-45", sel("grok-4.5")],
    ["grok-43", sel("grok-4.3")],
    ["grok-420-0309-reasoning", sel("grok-4.20-0309-reasoning")],
    ["grok-420-0309-non-reasoning", sel("grok-4.20-0309-non-reasoning")],
    ["grok-build-01", sel("grok-build-0.1")],
    ["grok-420-reasoning", sel("grok-4.20-reasoning")],
  ])("%s", (id, expected) => {
    expect(normalizeModelSelection(id)).toEqual(expected);
  });

  it("keeps ids that are already current", () => {
    for (const id of [
      "grok-default",
      "grok-build-latest",
      "grok-4.8",
      "agy:default",
      "agy:gemini-3.8-flash-low",
      "codex-model:future-model",
      "gpt-6.1-sol",
      "opencode:openai/gpt-x",
      "multica:agent-1",
      "provider-upstream:codex:custom",
    ]) {
      expect(normalizeModelSelection(id)).toEqual(sel(id));
    }
  });

  it("every static id is a fixed point", () => {
    for (const model of STATIC_MODELS) expect(normalizeModelId(model.id)).toBe(model.id);
  });

  it("every exact alias targets a static id", () => {
    const ids = new Set(STATIC_MODELS.map((m) => m.id));
    for (const alias of Object.values(LEGACY_MODEL_ALIASES)) expect(ids.has(alias.id)).toBe(true);
  });

  it("explicit effort wins over the encoded one; invalid explicit effort is ignored", () => {
    expect(normalizeModelSelection("gpt61-sol-high", "low")).toEqual(sel("gpt-6.1-sol", "low"));
    expect(normalizeModelSelection("gpt61-sol-high", "none")).toEqual(sel("gpt-6.1-sol", "high"));
  });

  it("empty ids fall back to the default model", () => {
    expect(normalizeModelSelection(undefined)).toEqual(sel("sonnet"));
    expect(normalizeModelSelection("")).toEqual(sel("sonnet"));
  });
});

describe("getMOrMulticaFallback with legacy ids", () => {
  it("applies the encoded effort and grokContinue to the resolved model", () => {
    expect(getMOrMulticaFallback("gpt61-sol-high")).toMatchObject({ id: "gpt-6.1-sol", provider: "codex", effort: "high" });
    expect(getMOrMulticaFallback("codex-model:gpt-6.1-sol:none")).toMatchObject({ id: "gpt-6.1-sol", effort: "medium" });
    expect(getMOrMulticaFallback("grok-46-continue")).toMatchObject({ id: "grok-4.6", cliFlag: "grok-4.6", grokContinue: true });
    expect(getMOrMulticaFallback("sonnet-1m")).toMatchObject({ id: "sonnet", cliFlag: "sonnet" });
  });

  it("keeps undiscovered runtime ids instead of switching provider", () => {
    expect(getMOrMulticaFallback("codex-model:future-model:high")).toMatchObject({
      id: "codex-model:future-model",
      provider: "codex",
      cliFlag: "future-model",
      effort: "high",
    });
    expect(getMOrMulticaFallback("agy:gemini-x")).toMatchObject({ id: "agy:gemini-x", provider: "agy", cliFlag: "gemini-x" });
    expect(getMOrMulticaFallback("grok-9.9")).toMatchObject({ id: "grok-9.9", provider: "grok", cliFlag: "grok-9.9" });
    expect(getMOrMulticaFallback("agy:default")).toMatchObject({ provider: "agy", cliFlag: "" });
  });
});
