import { describe, expect, it } from "vitest";
import {
  STATIC_MODELS,
  buildRuntimeModels,
  getAvailableModels,
  getMOrMulticaFallback,
  mergeModelCatalog,
  normalizeRuntimeModelCatalog,
  parseAgyModelsOutput,
  parseCodexModelsCache,
  parseGrokModelsOutput,
  type ModelDefinition,
} from "..";

describe("buildRuntimeModels", () => {
  it("builds one model per Codex slug with its advertised efforts and context", () => {
    const models = buildRuntimeModels({
      codex: [{ slug: "gpt-6-sol", context_window: 123_456, supported_reasoning_levels: [null, { effort: "high" }] }],
    });
    expect(models).toHaveLength(1);
    expect(models[0]).toMatchObject({
      id: "gpt-6-sol",
      provider: "codex",
      cliFlag: "gpt-6-sol",
      contextWindow: 123_456,
      efforts: ["high"],
      defaultEffort: "high",
      runtimeCatalog: true,
    });
  });

  it("does not let a `none`-only compatibility cache erase verified efforts", () => {
    const [sol] = buildRuntimeModels({ codex: [{ slug: "gpt-6.1-sol", supported_reasoning_levels: ["none"] }] });
    expect(sol).toMatchObject({
      id: "gpt-6.1-sol",
      efforts: ["low", "medium", "high", "xhigh", "max"],
      defaultEffort: "medium",
      contextWindow: 1_050_000,
    });
    expect(sol?.minCliVersion).toBeUndefined();
  });

  it("gives unknown Codex slugs a codex-model: id and no effort when none is advertised", () => {
    const [future, none] = buildRuntimeModels({
      codex: [
        { slug: "future-model", display_name: "Future", supported_reasoning_levels: ["high", "low"], default_reasoning_level: "high" },
        { slug: "plain-model", supported_reasoning_levels: ["none"] },
      ],
    });
    expect(future).toMatchObject({ id: "codex-model:future-model", name: "Future", efforts: ["low", "high"], defaultEffort: "high" });
    expect(none).toMatchObject({ id: "codex-model:plain-model", name: "plain-model", efforts: [], defaultEffort: null });
  });

  it("orders efforts weakest → strongest and falls back to medium for an unsupported default", () => {
    const [m] = buildRuntimeModels({
      codex: [{ slug: "x", supported_reasoning_levels: ["max", "medium", "low"], default_reasoning_level: "ultra" }],
    });
    expect(m).toMatchObject({ efforts: ["low", "medium", "max"], defaultEffort: "medium" });
  });

  it("drops hidden Codex entries and invalid Grok / AGY slugs", () => {
    const models = buildRuntimeModels({
      codex: [{ slug: "secret", visibility: "hide" }],
      grok: ["grok-4.6", "not-grok", "grok-4.6"],
      agy: [{ slug: "-bad", name: "Bad" }, { slug: "gemini-3.8-flash-low", name: "Gemini 3.8 Flash (Low)" }],
    });
    expect(models.map((m) => m.id)).toEqual(["grok-4.6", "agy:gemini-3.8-flash-low"]);
  });

  it("reuses static Grok metadata (un-hiding CLI aliases) and builds bare entries for new slugs", () => {
    const models = buildRuntimeModels({ grok: ["grok-4.20-reasoning", "grok-5.0"] });
    expect(models[0]).toMatchObject({ id: "grok-4.20-reasoning", contextWindow: 1_000_000, runtimeCatalog: true });
    expect(models[0]?.hidden).toBeUndefined();
    expect(models[1]).toMatchObject({ id: "grok-5.0", cliFlag: "grok-5.0", provider: "grok", runtimeCatalog: true });
    expect(models[1]?.contextWindow).toBeUndefined();
  });

  it("builds AGY models with agy: ids and no context window", () => {
    const [m] = buildRuntimeModels({ agy: [{ slug: "claude-sonnet-4-6", name: "Claude Sonnet 4.6 (Thinking)" }] });
    expect(m).toMatchObject({ id: "agy:claude-sonnet-4-6", provider: "agy", cliFlag: "claude-sonnet-4-6", tag: "AGY Claude Sonnet 4.6 (Thinking)" });
    expect(m?.contextWindow).toBeUndefined();
  });

  it("tolerates missing / null catalogs", () => {
    expect(buildRuntimeModels(null)).toEqual([]);
    expect(buildRuntimeModels({})).toEqual([]);
  });
});

describe("mergeModelCatalog / getAvailableModels", () => {
  const ids = (models: readonly ModelDefinition[]) => models.map((m) => m.id);

  it("replaces the static entry with the runtime one (same provider + slug), keeping a single id", () => {
    const runtime = buildRuntimeModels({ codex: [{ slug: "gpt-6-sol", context_window: 123_456, supported_reasoning_levels: ["high"] }] });
    const merged = mergeModelCatalog(STATIC_MODELS, runtime);
    const sol = merged.filter((m) => m.cliFlag === "gpt-6-sol");
    expect(sol).toHaveLength(1);
    expect(sol[0]).toMatchObject({ runtimeCatalog: true, contextWindow: 123_456 });
  });

  it("marks static Grok entries unavailable unless discovered; the CLI default never is", () => {
    const merged = getAvailableModels(buildRuntimeModels({ grok: ["grok-4.6"] }));
    const grok = merged.filter((m) => m.provider === "grok");
    expect(grok.find((m) => m.id === "grok-default")?.unavailable).toBeUndefined();
    expect(grok.find((m) => m.id === "grok-4.6")).toMatchObject({ runtimeCatalog: true });
    expect(grok.find((m) => m.id === "grok-4.6")?.unavailable).toBeUndefined();
    expect(grok.find((m) => m.id === "grok-4.7")).toMatchObject({ unavailable: true });
    expect(getMOrMulticaFallback("grok-47", buildRuntimeModels({ grok: ["grok-4.6"] }))).toMatchObject({
      id: "grok-4.7",
      cliFlag: "grok-4.7",
      unavailable: true,
    });
    expect(getMOrMulticaFallback("grok-46-continue", buildRuntimeModels({ grok: ["grok-4.6"] })).unavailable).toBeUndefined();
  });

  it("marks every slugged Grok entry unavailable when discovery returned nothing", () => {
    const grok = getAvailableModels().filter((m) => m.provider === "grok" && !m.unavailable);
    expect(ids(grok)).toEqual(["grok-default"]);
  });

  it("provider overrides drop that provider's static and runtime models and de-duplicate", () => {
    const override: ModelDefinition = {
      id: "provider-upstream:codex:custom",
      name: "custom",
      tag: "CUSTOM",
      provider: "codex",
      cliFlag: "custom",
      contextWindow: 272_000,
      efforts: [],
      defaultEffort: null,
      providerOverride: true,
    };
    const runtime = buildRuntimeModels({ codex: [{ slug: "future-model", supported_reasoning_levels: ["high"] }] });
    const merged = getAvailableModels([...runtime, override, override]);
    expect(merged.filter((m) => m.provider === "codex")).toEqual([override]);
    expect(merged.some((m) => m.provider === "claude")).toBe(true);
  });

  it("later duplicates replace earlier ones in place", () => {
    const a: ModelDefinition = { id: "multica:x", name: "A", tag: "A", provider: "multica" };
    const b: ModelDefinition = { id: "multica:x", name: "B", tag: "B", provider: "multica" };
    const merged = mergeModelCatalog([], [], [a, b]);
    expect(merged).toEqual([b]);
  });

  it("resolves runtime-only ids with their effort", () => {
    const runtime = buildRuntimeModels({ codex: [{ slug: "future-model", supported_reasoning_levels: ["high"] }] });
    const [id] = ids(runtime);
    expect(id).toBe("codex-model:future-model");
    expect(getMOrMulticaFallback(id, runtime)).toMatchObject({ cliFlag: "future-model", effort: "high" });
    expect(getMOrMulticaFallback("codex-model:future-model:high", runtime)).toMatchObject({ id: "codex-model:future-model", effort: "high" });
  });
});

describe("catalog parsers", () => {
  it("parseCodexModelsCache keeps only metadata and drops hidden / malformed entries", () => {
    const records = parseCodexModelsCache({
      models: [
        { slug: "safe-model", display_name: "Safe", context_window: 500, supported_reasoning_levels: [{ effort: "high", internal: "omit" }], api_key: "fixture-only", instructions: "omit" },
        { slug: "hidden-model", visibility: "hide" },
        { display_name: "no slug" },
        null,
      ],
    });
    expect(records).toEqual([{ slug: "safe-model", display_name: "Safe", context_window: 500, supported_reasoning_levels: ["high"] }]);
    expect(parseCodexModelsCache("broken")).toEqual([]);
    expect(parseCodexModelsCache({ models: "nope" })).toEqual([]);
  });

  it("parseGrokModelsOutput accepts catalog rows and ignores warnings, ANSI and duplicates", () => {
    expect(
      parseGrokModelsOutput(
        "Model 'grok-4.6' is using its own API key.\nDefault model: grok-4.6\nAvailable models:\n * grok-4.6 (default)\n - \u001b[32mgrok-4.7\u001b[0m\n - grok-4.7\n - not-a-model",
      ),
    ).toEqual(["grok-4.6", "grok-4.7"]);
    expect(parseGrokModelsOutput(undefined)).toEqual([]);
  });

  it("parseAgyModelsOutput reads tab-separated rows, de-duplicates and clips names", () => {
    const long = "x".repeat(200);
    expect(parseAgyModelsOutput(`gemini-a\tGemini A\r\nnoise line\ngemini-a\tGemini A2\nlong\t${long}\n`)).toEqual([
      { slug: "gemini-a", name: "Gemini A2" },
      { slug: "long", name: "x".repeat(160) },
    ]);
  });

  it("normalizeRuntimeModelCatalog sanitizes untrusted IPC data", () => {
    expect(normalizeRuntimeModelCatalog(null)).toEqual({ codex: [], grok: [], agy: [] });
    expect(
      normalizeRuntimeModelCatalog({
        codex: [{ slug: "a", extra: 1 }, { slug: 3 }],
        grok: ["grok-4.6", 7, "bogus", "grok-4.6"],
        agy: [{ slug: "m1", name: "" }, { slug: "bad slug", name: "x" }],
      }),
    ).toEqual({ codex: [{ slug: "a", display_name: "a" }], grok: ["grok-4.6"], agy: [{ slug: "m1", name: "m1" }] });
  });
});
