import { describe, expect, it } from "vitest";
import type { DispatchRowResult } from "@shared/chat/types";
import { MODELS, defaultPlannerModel, getAvailableModels, isPlannerModel, type ModelDefinition } from "@shared/models";
import {
  buildDispatchPayload,
  buildModelPayload,
  cleanDispatchPlanError,
  defaultCustomBranch,
  dynamicModelsOf,
  groupOptions,
  issueOptions,
  makeCustomRow,
  resolvePlannerModelId,
  rowsFromPlan,
  sanitizeBranchName,
  summarizeDispatch,
  uniqueBranchName,
  updateRow,
  validateRows,
  type DispatchRow,
} from "../plan";
import { translateOr, type Translator } from "../translator";

const t: Translator = (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key);
const NOW = new Date(2026, 9, 1, 9, 5);

const opencode: ModelDefinition = {
  id: "opencode:acme/m1",
  name: "M1",
  tag: "M1",
  provider: "opencode",
  cliFlag: "acme/m1",
  providerId: "acme",
  modelId: "m1",
  apiKey: "k",
};
const multica: ModelDefinition = { id: "multica:agent", name: "Agent", tag: "AG", provider: "multica" };
const models = getAvailableModels([opencode, multica]);

function row(overrides: Partial<DispatchRow>): DispatchRow {
  return { key: "k", prompt: "do it", branch: "b", model: "", effort: null, attachments: [], ...overrides };
}

describe("planner model selection", () => {
  it("only claude / codex / opencode can plan", () => {
    expect(isPlannerModel(opencode)).toBe(true);
    expect(isPlannerModel(multica)).toBe(false);
    expect(isPlannerModel(null)).toBe(false);
  });

  it("prefers the default model, normalizing legacy ids", () => {
    expect(defaultPlannerModel(models, "opus")).toBe("opus");
    expect(defaultPlannerModel(models, "gpt55-med")).toBe("gpt-5.5");
    expect(defaultPlannerModel(models, "gpt54-high")).toBe("gpt-6-astra");
  });

  it("falls back to the app default, then the first planner", () => {
    expect(defaultPlannerModel(models, "multica:agent")).toBe("sonnet");
    expect(defaultPlannerModel([multica, opencode], "nope")).toBe(opencode.id);
    expect(defaultPlannerModel([multica], "nope")).toBe("");
  });

  it("keeps a valid selection and replaces a vanished one", () => {
    expect(resolvePlannerModelId(models, "haiku", "opus")).toBe("haiku");
    expect(resolvePlannerModelId(models, "multica:agent", "opus")).toBe("opus");
    expect(resolvePlannerModelId(models, "removed", "opus")).toBe("opus");
  });
});

describe("branches and rows", () => {
  it("names default branches by local date/time", () => {
    expect(defaultCustomBranch(0, NOW)).toBe("dispatch-20261001-0905-1");
    expect(makeCustomRow(2, NOW)).toMatchObject({ branch: "dispatch-20261001-0905-3", model: "", effort: null, attachments: [] });
  });

  it("slugifies and de-duplicates branch names within 48 chars", () => {
    expect(sanitizeBranchName("Fix: The Login Bug!", 0, NOW)).toBe("fix-the-login-bug");
    expect(sanitizeBranchName("!!!", 1, NOW)).toBe("dispatch-20261001-0905-2");
    const used = new Set<string>();
    const long = "x".repeat(48);
    expect(uniqueBranchName("a", used)).toBe("a");
    expect(uniqueBranchName("a", used)).toBe("a-2");
    expect(uniqueBranchName(long, used)).toBe(long);
    expect(uniqueBranchName(long, used)).toBe(`${"x".repeat(46)}-2`);
  });

  it("turns planner rows into editable rows", () => {
    const rows = rowsFromPlan(
      [
        { title: "Add tests", prompt: " write tests ", branch: "add-tests", model: "opus" },
        { title: "Docs", prompt: "docs", branch: "add-tests", model: "gpt-99" },
        { title: "", prompt: "  ", branch: "x" },
      ],
      new Set(models.map((m) => m.id)),
      NOW,
    );
    expect(rows.map((r) => [r.prompt, r.branch, r.model])).toEqual([
      ["write tests", "add-tests", "opus"],
      ["docs", "add-tests-2", ""],
    ]);
  });

  it("updates one row, functionally if asked", () => {
    const rows = [row({ key: "a" }), row({ key: "b", attachments: [] })];
    const next = updateRow(rows, "b", (r) => ({ attachments: [...r.attachments, { type: "file", path: "/x" }] }));
    expect(next[0]).toBe(rows[0]);
    expect(next[1]?.attachments).toHaveLength(1);
    expect(updateRow(rows, "a", { prompt: "p" })[0]?.prompt).toBe("p");
  });
});

describe("payloads", () => {
  it("describes planner models with clamped effort and OpenCode config", () => {
    const opus = MODELS.find((m) => m.id === "opus");
    if (!opus) throw new Error("missing opus");
    expect(buildModelPayload(opus).effort).toBeUndefined();
    expect(buildModelPayload(opus, { effort: "ultra" }).effort).toBe("max");
    const haiku = MODELS.find((m) => m.id === "haiku");
    if (!haiku) throw new Error("missing haiku");
    expect(buildModelPayload(haiku, { effort: "high" }).effort).toBeUndefined();
    expect(buildModelPayload(opencode, { includeRuntimeConfig: true }).openCodeConfig).toEqual({
      providerId: "acme", modelId: "m1", apiKey: "k", baseURL: "",
    });
    expect(buildModelPayload(opencode).openCodeConfig).toBeUndefined();
  });

  it("inheriting rows take the default model and effort", () => {
    const payload = buildDispatchPayload(
      [
        row({ branch: " b1 ", prompt: " p1 " }),
        row({ branch: "b2", model: "opus", effort: "low", issue: { number: 7, title: "Bug" } }),
      ],
      { model: "gpt-6-astra", effort: "high", cwd: "/repo" },
    );
    expect(payload[0]).toMatchObject({ prompt: "p1", branch: "b1", model: "gpt-6-astra", effort: "high", cwd: "/repo" });
    expect(payload[1]).toMatchObject({ model: "opus", effort: "low", issueContext: "Issue #7: Bug", tag: "#7" });
  });

  it("validates prompts and branches", () => {
    const errors = validateRows(
      [row({ key: "a", prompt: " " }), row({ key: "b", branch: " " }), row({ key: "c", branch: "x" }), row({ key: "d", branch: "x " })],
      t,
    );
    expect(errors).toEqual({ a: "dispatch.errorPromptEmpty", b: "dispatch.errorBranchEmpty", d: "dispatch.errorBranchDuplicate" });
  });

  it("maps results back to rows", () => {
    const rows = [row({ key: "a", branch: "one" }), row({ key: "b", branch: "two " })];
    const results: DispatchRowResult[] = [
      { ok: true, chatId: "c1", row: { prompt: "", model: "", cwd: "", branch: "one" } },
      { ok: false, chatId: "c2", row: { prompt: "", model: "", cwd: "", branch: "two" }, error: new Error("worktree exists") },
    ];
    const outcome = summarizeDispatch(rows, results, "failed");
    expect(outcome.errors).toEqual({ b: "worktree exists" });
    expect([outcome.succeeded, outcome.failed]).toEqual([1, 1]);
    expect([...outcome.successBranches]).toEqual(["one"]);
  });

  it("cleans planner IPC errors", () => {
    expect(cleanDispatchPlanError(new Error("Error invoking remote method 'dispatch-plan': Error: boom"), "fb")).toBe("Error: boom");
    expect(cleanDispatchPlanError(null, "fb")).toBe("fb");
  });
});

describe("options", () => {
  it("builds issue options for loading / error / loaded", () => {
    expect(issueOptions([], true, null, t).map((o) => o.value)).toEqual(["", "__loading"]);
    expect(issueOptions([], false, "nope", t)[1]?.label).toBe("nope");
    expect(issueOptions([{ number: 3, title: "T" }], false, null, t)[1]).toMatchObject({ value: "3", label: "#3 T", triggerLabel: "#3" });
  });

  it("groups options in first-seen order", () => {
    const groups = groupOptions([
      { value: "a", label: "A", group: "X" },
      { value: "b", label: "B", group: "Y" },
      { value: "c", label: "C", group: "X" },
    ], true);
    expect(groups.map(([g, opts]) => [g, opts.length])).toEqual([["X", 2], ["Y", 1]]);
    expect(groupOptions([{ value: "a", label: "A", group: "X" }], false)[0]?.[0]).toBe("");
  });

  it("separates dynamic models from the built-in catalogue", () => {
    expect(dynamicModelsOf(models).map((m) => m.id)).toEqual([opencode.id, multica.id]);
  });

  it("falls back to English for missing translation keys", () => {
    const echo: Translator = (key) => key;
    expect(translateOr(echo, "x.missing", "Use {value}", { value: "main" })).toBe("Use main");
    expect(translateOr(() => "Dispatch!", "dispatch.title", "Fallback")).toBe("Dispatch!");
  });
});
