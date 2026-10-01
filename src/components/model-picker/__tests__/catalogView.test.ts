import { describe, expect, it } from "vitest";
import { getAvailableModels, getM, type ModelDefinition } from "@shared/models";
import type { Translator } from "../../../i18n";
import { createTranslator } from "../../../i18n";
import {
  buildPickerOptions,
  computeMenuPosition,
  displayedEffort,
  dropRetired,
  filterInheritOption,
  getDisabledReason,
  getModelBadges,
  groupByProvider,
  INHERIT_GROUP,
  moveActiveId,
  providerGroupLabel,
  type PickerOptionsContext,
} from "../catalogView";
import { badgeView, disabledReasonText, effortLabel, pickerText } from "../strings";

const BEFORE_RETIREMENT = Date.parse("2026-10-01T00:00:00Z");
const AFTER_RETIREMENT = Date.parse("2026-10-20T00:00:00Z");

const ctx = (overrides: Partial<PickerOptionsContext> = {}): PickerOptionsContext => ({
  installed: {},
  versions: undefined,
  retainedIds: [],
  nowMs: BEFORE_RETIREMENT,
  query: "",
  purpose: "chat",
  ...overrides,
});

const ids = (models: readonly { id: string }[]) => models.map((model) => model.id);
const t: Translator = createTranslator("en-US");

describe("buildPickerOptions", () => {
  const models = getAvailableModels([]);

  it("lists legacy models with a badge until they retire", () => {
    const gpt55 = buildPickerOptions(models, ctx()).find((option) => option.id === "gpt-5.5");
    expect(gpt55?.badges).toEqual([{ kind: "retiring", date: "2026-10-14", successorName: "GPT-6 Astra" }]);
    expect(ids(buildPickerOptions(models, ctx({ nowMs: AFTER_RETIREMENT })))).not.toContain("gpt-5.5");
  });

  it("keeps a retired or hidden model when it is the saved choice (no silent switch)", () => {
    const retained = buildPickerOptions(models, ctx({ nowMs: AFTER_RETIREMENT, retainedIds: ["gpt55-high"] }));
    expect(ids(retained)).toContain("gpt-5.5");
    expect(retained.find((option) => option.id === "gpt-5.5")?.badges[0]?.kind).toBe("retired");
    const hidden = models.find((model) => model.hidden);
    expect(hidden).toBeDefined();
    expect(ids(buildPickerOptions(models, ctx()))).not.toContain(hidden?.id);
    expect(ids(buildPickerOptions(models, ctx({ retainedIds: [hidden?.id] })))).toContain(hidden?.id);
  });

  it("hides providers whose CLI is missing", () => {
    const options = buildPickerOptions(models, ctx({ installed: { codex: false } }));
    expect(options.some((option) => option.provider === "codex")).toBe(false);
    expect(options.some((option) => option.provider === "claude")).toBe(true);
  });

  it("only hints at minCliVersion until the CLI version is known", () => {
    const hint = buildPickerOptions(models, ctx()).find((option) => option.id === "gpt-6.1-sol");
    expect(hint?.badges).toContainEqual({ kind: "needs-cli", minVersion: "0.159.1", verified: false });
    expect(hint?.disabled).toBeNull();

    const outdated = buildPickerOptions(models, ctx({ versions: { codex: "0.153.4" } })).find((o) => o.id === "gpt-6.1-sol");
    expect(outdated?.badges).toContainEqual({ kind: "needs-cli", minVersion: "0.159.1", verified: true });
    expect(outdated?.disabled).toBe("cli-outdated");

    const current = buildPickerOptions(models, ctx({ versions: { codex: "0.160.0" } })).find((o) => o.id === "gpt-6.1-sol");
    expect(current?.badges.some((badge) => badge.kind === "needs-cli")).toBe(false);
    expect(current?.disabled).toBeNull();
  });

  it("searches names, punctuation-free slugs and supported efforts", () => {
    expect(ids(buildPickerOptions(models, ctx({ query: "61sol" })))).toEqual(["gpt-6.1-sol"]);
    const ultra = buildPickerOptions(models, ctx({ query: "astra ultra" }));
    expect(ids(ultra)).toEqual(["gpt-6-astra"]);
    expect(buildPickerOptions(models, ctx({ query: "不存在的模型" }))).toHaveLength(0);
  });

  it("disables non-planner models for the dispatch planner", () => {
    const remote = { ...getM("sonnet"), id: "remote-ssh:claude:sonnet", provider: "remote-claude" } as unknown as ModelDefinition;
    expect(getDisabledReason(remote, "planner", null)).toBe("planner");
    expect(getDisabledReason(getM("sonnet"), "planner", null)).toBeNull();
    expect(getDisabledReason({ ...getM("sonnet"), unavailable: true }, "chat", null)).toBe("unavailable");
  });
});

describe("inherit option", () => {
  it("is labelled, grouped first, and filtered by the query", () => {
    const option = filterInheritOption(getM("sonnet"), "(default) · Claude Sonnet", "");
    expect(option).toMatchObject({ id: "", provider: INHERIT_GROUP, disabled: null });
    expect(filterInheritOption(getM("sonnet"), "(default) · Claude Sonnet", "astra")).toBeNull();
    const groups = groupByProvider([{ provider: "codex" }, option ?? { provider: "x" }, { provider: "claude" }]);
    expect(groups.map((group) => group.provider)).toEqual(["inherit", "claude", "codex"]);
  });
});

describe("grouping and labels", () => {
  it("orders known providers first and keeps unknown providers last", () => {
    const groups = groupByProvider([{ provider: "zzz" }, { provider: "multica" }, { provider: "claude" }, { provider: "remote-codex" }]);
    expect(groups.map((group) => group.provider)).toEqual(["claude", "remote-codex", "multica", "zzz"]);
    expect(providerGroupLabel("remote-codex", "INHERIT")).toBe("SSH / CODEX");
    expect(providerGroupLabel("inherit", "INHERIT")).toBe("INHERIT");
    expect(providerGroupLabel("codex", "")).toBe("CODEX");
  });
});

describe("dropRetired", () => {
  it("drops models past retiresOn unless retained", () => {
    const models = getAvailableModels([]);
    expect(ids(dropRetired(models, [], AFTER_RETIREMENT))).not.toContain("gpt-5.5");
    expect(ids(dropRetired(models, ["gpt-5.5"], AFTER_RETIREMENT))).toContain("gpt-5.5");
  });
});

describe("effort", () => {
  it("shows the explicit effort clamped to the model, else its default", () => {
    const haiku = getM("haiku");
    expect(displayedEffort(haiku, "high")).toBeNull();
    const sonnet = getM("sonnet");
    expect(displayedEffort(sonnet, null)).toBe("high");
    expect(displayedEffort(sonnet, "ultra")).toBe("max");
    expect(displayedEffort(getM("gpt-5.5"), "max")).toBe("xhigh");
  });

  it("labels efforts with English fallbacks until the locale keys exist", () => {
    expect(effortLabel(t, "xhigh")).toBe("Extra high");
    expect(pickerText(t, "modelPicker.effortDefault", { effort: "Medium" })).toBe("Default (Medium)");
  });
});

describe("badges", () => {
  it("renders retirement with a successor hint and CLI gating text", () => {
    const retiring = badgeView(t, { kind: "retiring", date: "2026-10-14", successorName: "GPT-6 Astra" });
    expect(retiring.text).toBe("Retires 2026-10-14");
    expect(retiring.hint).toContain("GPT-6 Astra");
    expect(badgeView(t, { kind: "needs-cli", minVersion: "1.2.3", verified: false }).tone).toBe("muted");
    expect(disabledReasonText(t, "cli-outdated", "1.2.3")).toContain("1.2.3");
    expect(disabledReasonText(t, "planner", undefined)).toBe("Not supported for planning");
  });

  it("marks lifecycle legacy models without a retirement date", () => {
    const legacy: ModelDefinition = { ...getM("sonnet"), lifecycle: "legacy" };
    expect(getModelBadges(legacy, { nowMs: BEFORE_RETIREMENT, cliVersion: null })).toEqual([{ kind: "legacy" }]);
  });
});

describe("keyboard and placement", () => {
  it("wraps arrow navigation over enabled options", () => {
    expect(moveActiveId(["a", "b", "c"], "c", 1)).toBe("a");
    expect(moveActiveId(["a", "b", "c"], "a", -1)).toBe("c");
    expect(moveActiveId(["a", "b"], null, 1)).toBe("a");
    expect(moveActiveId(["a", "b"], "gone", -1)).toBe("b");
    expect(moveActiveId([], "a", 1)).toBeNull();
  });

  it("opens below the trigger, or above when there is more room there", () => {
    const below = computeMenuPosition({ top: 40, bottom: 60, right: 600 }, 1200, 900);
    expect(below).toMatchObject({ top: 66, left: 220, width: 380, maxHeight: 420 });
    const above = computeMenuPosition({ top: 800, bottom: 820, right: 600 }, 1200, 900);
    expect(above.top).toBe(800 - above.maxHeight - 6);
    const narrow = computeMenuPosition({ top: 40, bottom: 60, right: 100 }, 300, 900);
    expect(narrow.width).toBe(284);
    expect(narrow.left).toBe(8);
  });
});
