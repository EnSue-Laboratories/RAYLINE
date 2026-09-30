import test from "node:test";
import assert from "node:assert/strict";
import { getAvailableModels, buildRuntimeModels } from "../src/data/models.js";
import { visibleModels, isPlannerModel, defaultPlannerModel, modelLabel } from "../src/utils/modelOptions.js";
import { filterModels } from "../src/utils/modelSearch.js";

test("shared options retain reasoning levels and suppress uninstalled runtimes and legacy aliases", () => {
  const runtime = buildRuntimeModels({ codex: [{ slug: "gpt-6.1-sol", supported_reasoning_levels: ["none"] }], agy: [{ slug: "gemini-test", name: "Gemini test" }] });
  const options = visibleModels(getAvailableModels(runtime), { codex: true, claude: true, agy: true, grok: false });
  const sol = filterModels(options, "61sol");
  assert.equal(sol.length, 5); assert.equal(new Set(sol.map(model => modelLabel(model))).size, 5);
  assert.ok(!options.some(model => model.provider === "grok" || model.legacy));
  assert.ok(options.some(model => model.id === "agy:gemini-test"));
});

test("provider overrides and connected SSH options use the same catalog policy", () => {
  const override = { id: "provider-upstream:codex:custom", provider: "codex", providerOverride: true, name: "Custom" };
  const remote = { id: "remote-test", provider: "remote-codex", remoteRuntime: { type: "ssh" }, name: "Remote" };
  const options = visibleModels(getAvailableModels([override, override, remote]), { codex: true });
  assert.deepEqual(options.filter(model => model.provider === "codex"), [override]);
  assert.ok(options.includes(remote)); assert.equal(isPlannerModel(remote), false);
});

test("planner eligibility is an explicit subset without changing execution options", () => {
  const models = getAvailableModels(buildRuntimeModels({ agy: [{ slug: "claude-sonnet-4-6", name: "Claude on AGY" }] }));
  const visible = visibleModels(models, { claude: true, codex: true, agy: true, grok: true });
  assert.ok(visible.some(model => model.provider === "agy"));
  assert.ok(visible.filter(isPlannerModel).every(model => ["claude", "codex", "opencode"].includes(model.provider)));
  assert.equal(defaultPlannerModel(visible, "codex-model:gpt-6.1-sol:none"), "codex-model:gpt-6.1-sol:medium");
  assert.notEqual(defaultPlannerModel(visible, "agy:claude-sonnet-4-6"), "agy:claude-sonnet-4-6");
  assert.equal(defaultPlannerModel(visible.filter(model => model.provider === "agy"), "agy:default"), "");
});

test("a selected legacy model remains visible without restoring every retired choice", () => {
  const models = [{ id: "selected-old", provider: "claude", legacy: true }, { id: "other-old", provider: "claude", legacy: true }];
  assert.deepEqual(visibleModels(models, { claude: true }, ["selected-old"]), [models[0]]);
});
