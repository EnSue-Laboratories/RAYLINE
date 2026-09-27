import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { MODELS, buildRuntimeModels, getAvailableModels, getMOrMulticaFallback } from "../src/data/models.js";
import { filterModels } from "../src/utils/modelSearch.js";
import { readDraft, writeDraft, clearDraft } from "../src/utils/composerDrafts.js";
import { appendAdjacentTextPart } from "../src/utils/streamParts.js";
import { readCodexCatalog } from "../electron/model-catalog.cjs";

const storage = () => {
  const map = new Map();
  return { getItem: (key) => map.get(key) || null, setItem: (key, value) => map.set(key, value), removeItem: (key) => map.delete(key) };
};

test("model search supports names, punctuation-free typing, provider and effort together", () => {
  assert.ok(filterModels(MODELS, "gPt6 aStRa high").length);
  assert.ok(filterModels(MODELS, "grok47").some((m) => m.cliFlag === "grok-4.7"));
  assert.ok(filterModels(MODELS, "codex luna max").every((m) => m.provider === "codex" && m.effort === "max"));
  assert.equal(filterModels(MODELS, "不存在的模型").length, 0);
});

test("runtime catalog uses supported efforts/context and does not silently change saved models", () => {
  const runtime = buildRuntimeModels({ codex: [{ slug: "gpt-6-sol", context_window: 123456, supported_reasoning_levels: [null, { effort: "high" }] }] });
  const models = getAvailableModels(runtime);
  const sol = models.filter((m) => m.cliFlag === "gpt-6-sol");
  assert.equal(sol.length, 1);
  assert.equal(sol[0].effort, "high");
  assert.equal(sol[0].contextWindow, 123456);
  assert.equal(getMOrMulticaFallback("gpt6-sol-ultra", runtime).cliFlag, "gpt-6-sol");
  assert.equal(getMOrMulticaFallback("grok-46-continue", runtime).grokContinue, true);
  assert.ok(MODELS.some((m) => m.cliFlag === "haiku"));
});

test("provider overrides take precedence and repeated model IDs are de-duplicated", () => {
  const override = { id: "provider-upstream:codex:custom", cliFlag: "custom", provider: "codex", providerOverride: true };
  const runtime = buildRuntimeModels({ codex: [{ slug: "future-model", supported_reasoning_levels: ["high"] }] });
  assert.deepEqual(getAvailableModels([...runtime, override, override]).filter((m) => m.provider === "codex"), [override]);
  const id = runtime[0].id;
  assert.equal(getMOrMulticaFallback(id).cliFlag, "future-model");
  assert.equal(getMOrMulticaFallback(id).effort, "high");
});

test("drafts preserve exact CJK/multiline text, attachments, and per-conversation isolation", async () => {
  const disk = storage();
  disk.setItem("rayline.composerDraft:legacy", "旧草稿\n  keep spacing  ");
  assert.equal(readDraft("legacy", disk).text, "旧草稿\n  keep spacing  ");
  const draft = { text: "你好\nDraft", attachments: [{ type: "file", path: "/tmp/example.txt" }] };
  writeDraft("chat-a", draft, disk);
  writeDraft("chat-b", { text: "independent" }, disk);
  assert.deepEqual(readDraft("chat-a", disk), draft);
  const coldStorage = await import("../src/utils/composerDrafts.js?cold-start");
  assert.deepEqual(coldStorage.readDraft("chat-a", disk), draft);
  clearDraft("chat-a", disk);
  assert.deepEqual(readDraft("chat-a", disk), {});
  assert.equal(disk.getItem("rayline.composerDraft:chat-a"), null);
  assert.equal(readDraft("chat-b", disk).text, "independent");
});

test("a storage quota error does not lose the in-memory draft on a screen switch", () => {
  const unavailable = { getItem() { throw Error("blocked"); }, setItem() { throw Error("quota"); }, removeItem() { throw Error("blocked"); } };
  writeDraft("quota-chat", { text: "preserve me", attachments: [{ name: "image.png" }] }, unavailable);
  assert.equal(readDraft("quota-chat", unavailable).text, "preserve me");
  clearDraft("quota-chat", unavailable);
  assert.deepEqual(readDraft("quota-chat", unavailable), {});
});

test("Grok delta chunks form paragraphs without crossing tool/reasoning boundaries", () => {
  const original = [{ type: "text", text: "你" }];
  let parts = appendAdjacentTextPart(original, "text", "好");
  assert.equal(parts.length, 1);
  assert.equal(parts[0].text, "你好");
  assert.equal(original[0].text, "你");
  parts = [...parts, { type: "tool", name: "Read" }];
  parts = appendAdjacentTextPart(parts, "text", "after tool");
  parts = appendAdjacentTextPart(parts, "thinking", "reason");
  parts = appendAdjacentTextPart(parts, "thinking", "ing");
  assert.deepEqual(parts.map((p) => p.type), ["text", "tool", "text", "thinking"]);
  assert.equal(parts.at(-1).text, "reasoning");
  assert.equal(appendAdjacentTextPart(parts, "text", ""), parts);
});

test("catalog IPC exposes only model metadata and tolerates corrupt cache", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "rayline-catalog-test-"));
  try {
    const file = path.join(root, "models_cache.json");
    await writeFile(file, JSON.stringify({ models: [
      { slug: "safe-model", display_name: "Safe", context_window: 500, supported_reasoning_levels: [{ effort: "high", internal: "omit" }], api_key: "fixture-only", instructions: "omit" },
      { slug: "hidden-model", visibility: "hide" },
    ] }));
    const records = await readCodexCatalog({ root });
    assert.equal(records.length, 1);
    assert.equal(records[0].slug, "safe-model");
    assert.deepEqual(records[0].supported_reasoning_levels, ["high"]);
    assert.equal("api_key" in records[0], false);
    assert.equal("instructions" in records[0], false);
    await writeFile(file, "broken json");
    assert.deepEqual(await readCodexCatalog({ root }), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("typing does not reserialize image attachments on every keystroke", () => {
  const writes = [];
  const disk = { setItem: (key) => writes.push(key), removeItem() {} };
  const attachments = [{ name: "clipboard.png", dataUrl: "data:image/png;base64,fixture" }];
  writeDraft("large-draft", { text: "a", attachments }, disk);
  writeDraft("large-draft", { text: "ab", attachments }, disk);
  writeDraft("large-draft", { text: "abc", attachments }, disk);
  assert.equal(writes.filter((key) => key.endsWith(":attachments")).length, 1);
});
