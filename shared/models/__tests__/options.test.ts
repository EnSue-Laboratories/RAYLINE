import { describe, expect, it } from "vitest";
import {
  MODELS,
  PLANNER_PROVIDERS,
  STATIC_MODELS,
  buildRuntimeModels,
  defaultPlannerModel,
  filterModels,
  getAvailableModels,
  isPlannerModel,
  isPlannerProviderId,
  modelLabel,
  visibleModels,
  type ModelDefinition,
} from "..";

const remote: ModelDefinition = {
  id: "remote-ssh:codex:gpt-6-astra",
  name: "Remote GPT-6 Astra",
  tag: "SSH GPT-6 Astra",
  provider: "remote-codex",
  runtimeProvider: "codex",
  remoteRuntime: { type: "ssh", sshCommand: "ssh host" },
  baseModelId: "gpt-6-astra",
  cliFlag: "gpt-6-astra",
  contextWindow: 272_000,
  efforts: ["low"],
  defaultEffort: "low",
};

describe("visibleModels", () => {
  it("suppresses uninstalled runtimes, hidden aliases and unavailable Grok entries", () => {
    const runtime = buildRuntimeModels({
      codex: [{ slug: "gpt-6.1-sol", supported_reasoning_levels: ["none"] }],
      agy: [{ slug: "gemini-test", name: "Gemini test" }],
    });
    const options = visibleModels(getAvailableModels(runtime), { codex: true, claude: true, agy: true, grok: false });
    expect(options.some((m) => m.provider === "grok")).toBe(false);
    expect(options.some((m) => m.hidden)).toBe(false);
    expect(options.some((m) => m.id === "agy:gemini-test")).toBe(true);
    expect(options.find((m) => m.id === "gpt-6.1-sol")?.efforts).toHaveLength(5);
  });

  it("keeps the current selection visible even when hidden or unavailable (legacy id accepted)", () => {
    const models = getAvailableModels(buildRuntimeModels({ grok: ["grok-4.6"] }));
    expect(visibleModels(models, {}, ["grok-47"]).find((m) => m.id === "grok-4.7")).toMatchObject({ unavailable: true });
    expect(visibleModels(models, {}, ["grok-4.6-direct"]).some((m) => m.id === "grok-4.6-direct")).toBe(true);
    expect(visibleModels(models).some((m) => m.id === "grok-4.6-direct")).toBe(false);
    const withNew = getAvailableModels(buildRuntimeModels({ grok: ["grok-4.6", "grok-4.7"] }));
    expect(visibleModels(withNew).find((m) => m.id === "grok-4.7")?.unavailable).toBeUndefined();
  });

  it("keeps SSH remotes regardless of the local install state", () => {
    expect(visibleModels([remote], { codex: false })).toEqual([remote]);
  });

  it("treats missing install info as installed", () => {
    expect(visibleModels(MODELS)).toHaveLength(MODELS.length);
    expect(visibleModels(MODELS, { claude: false }).every((m) => m.provider !== "claude")).toBe(true);
  });
});

describe("planner helpers", () => {
  it("PLANNER_PROVIDERS is the explicit subset claude / codex / opencode", () => {
    expect([...PLANNER_PROVIDERS]).toEqual(["claude", "codex", "opencode"]);
    expect(isPlannerProviderId("codex")).toBe(true);
    expect(isPlannerProviderId("grok")).toBe(false);
    expect(isPlannerProviderId("agy")).toBe(false);
  });

  it("isPlannerModel excludes other providers, SSH remotes and unavailable models", () => {
    const visible = visibleModels(
      getAvailableModels(buildRuntimeModels({ agy: [{ slug: "claude-sonnet-4-6", name: "Claude on AGY" }], grok: ["grok-4.6"] })),
    );
    expect(visible.some((m) => m.provider === "agy")).toBe(true);
    expect(visible.filter(isPlannerModel).every((m) => isPlannerProviderId(m.provider))).toBe(true);
    expect(isPlannerModel(remote)).toBe(false);
    expect(isPlannerModel({ ...(MODELS[0] as ModelDefinition), unavailable: true })).toBe(false);
    expect(isPlannerModel(null)).toBe(false);
  });

  it("defaultPlannerModel normalizes the preference and falls back to sonnet, then first, then ''", () => {
    const visible = visibleModels(getAvailableModels(buildRuntimeModels({ agy: [{ slug: "claude-sonnet-4-6", name: "Claude on AGY" }] })));
    expect(defaultPlannerModel(visible, "codex-model:gpt-6.1-sol:none")).toBe("gpt-6.1-sol");
    expect(defaultPlannerModel(visible, "gpt54-high")).toBe("gpt-6-astra");
    expect(defaultPlannerModel(visible, "agy:claude-sonnet-4-6")).toBe("sonnet");
    expect(defaultPlannerModel(visible.filter((m) => m.provider === "codex"))).toBe("gpt-6-astra");
    expect(defaultPlannerModel(visible.filter((m) => m.provider === "agy"), "agy:default")).toBe("");
  });
});

describe("modelLabel", () => {
  it("uses name / tag and appends the effort", () => {
    const astra = MODELS.find((m) => m.id === "gpt-6-astra");
    expect(modelLabel(astra)).toBe("GPT-6 Astra");
    expect(modelLabel(astra, { effort: "high" })).toBe("GPT-6 Astra · high");
    expect(modelLabel(astra ? { ...astra, effort: "low" } : null, { short: true })).toBe("GPT-6 Astra · low");
    expect(modelLabel(astra ? { ...astra, effort: "low" } : null, { effort: null })).toBe("GPT-6 Astra");
    expect(modelLabel(STATIC_MODELS.find((m) => m.id === "opus-1m"), { short: true })).toBe("OPUS 1M");
    expect(modelLabel(null)).toBe("");
  });
});

describe("filterModels", () => {
  it("matches names, punctuation-free typing, provider and effort together", () => {
    expect(filterModels(STATIC_MODELS, "gPt6 aStRa high").map((m) => m.id)).toEqual(["gpt-6-astra"]);
    expect(filterModels(STATIC_MODELS, "61sol").map((m) => m.id)).toEqual(["gpt-6.1-sol"]);
    expect(filterModels(STATIC_MODELS, "grok47").map((m) => m.id)).toEqual(["grok-4.7"]);
    const lunaMax = filterModels(STATIC_MODELS, "codex luna max");
    expect(lunaMax.map((m) => m.id)).toEqual(["gpt-6-luna", "gpt-5.6-luna"]);
    expect(filterModels(STATIC_MODELS, "antigravity").map((m) => m.id)).toEqual(["agy:default"]);
    expect(filterModels(STATIC_MODELS, "不存在的模型")).toEqual([]);
  });

  it("returns everything for an empty query and matches the Grok continue option", () => {
    expect(filterModels(STATIC_MODELS, "  ")).toHaveLength(STATIC_MODELS.length);
    const grok = STATIC_MODELS.find((m) => m.id === "grok-4.6");
    expect(grok).toBeDefined();
    if (grok) {
      expect(filterModels([{ ...grok, grokContinue: true }], "继续")).toHaveLength(1);
      expect(filterModels([grok], "continue")).toHaveLength(0);
    }
  });
});
