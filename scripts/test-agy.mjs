import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAgyEvent, createAgyStreamState, buildAgyArgs } from "../electron/agy-agent-manager.cjs";
import { parseAgyCatalog } from "../electron/model-catalog.cjs";
import { parseSystemProxy } from "../electron/runtime-env.cjs";
import { buildRuntimeModels, getAvailableModels, getMOrMulticaFallback } from "../src/data/models.js";
import { filterModels } from "../src/utils/modelSearch.js";

test("GPT-6.1 Sol reasoning survives a compatibility catalog's none placeholder", () => {
  const models = buildRuntimeModels({ codex: [{ slug: "gpt-6.1-sol", display_name: "gpt-6.1-sol", context_window: 272000, default_reasoning_level: "none", supported_reasoning_levels: [{ effort: "none" }] }] });
  const rows = filterModels(getAvailableModels(models), "61sol");
  assert.deepEqual(rows.map(m => m.effort), ["medium", "low", "high", "xhigh", "max"]);
  assert.ok(rows.every(m => m.contextWindow === 272000 && m.name === "GPT-6.1 Sol"));
  const saved = getMOrMulticaFallback("codex-model:gpt-6.1-sol:none", models);
  assert.equal(saved.cliFlag, "gpt-6.1-sol"); assert.equal(saved.effort, "medium");
});

test("AGY model discovery accepts only structured model rows and routes Claude through AGY", () => {
  const rows = parseAgyCatalog("Fetching available models...\ngemini-3.8-flash-low\tGemini 3.8 Flash (Low)\nclaude-sonnet-4-6\tClaude Sonnet 4.6 (Thinking)\nclaude-sonnet-4-6\tClaude Sonnet 4.6 (Thinking)\n");
  assert.equal(rows.length, 2);
  const models = buildRuntimeModels({ agy: rows });
  assert.equal(getMOrMulticaFallback("agy:claude-sonnet-4-6", models).provider, "agy");
  assert.equal(getMOrMulticaFallback("agy:claude-sonnet-4-6").cliFlag, "claude-sonnet-4-6");
  assert.equal(models[0].contextWindow, null);
});

test("AGY deltas, completed tools and resumed usage are normalized without duplicate text", () => {
  const state = createAgyStreamState();
  normalizeAgyEvent({ event: "init", conversation_id: "test-session" }, state);
  const tool = normalizeAgyEvent({ event: "step_update", step_update: { step_index: 2, step_type: "tool", state: "ACTIVE", tool_name: "run_command", tool_info: { parameters: { CommandLine: "pwd" } } } }, state)[0];
  const done = normalizeAgyEvent({ event: "step_update", step_update: { step_index: 2, step_type: "tool", state: "DONE", tool_info: { output: "/workspace" } } }, state)[0];
  assert.equal(done.id, tool.id); assert.equal(done.status, "completed"); assert.equal(done.name, "run_command"); assert.deepEqual(done.input, { CommandLine: "pwd" });
  normalizeAgyEvent({ event: "step_update", step_update: { step_index: 3, step_type: "agent_response", text_delta: "你好", usage: { input_tokens: 100, output_tokens: 7, thinking_tokens: 2 } } }, state);
  const result = normalizeAgyEvent({ event: "result", result: { status: "SUCCESS", response: "你好", usage: { input_tokens: 900000, output_tokens: 10000 } } }, state);
  assert.equal(result.length, 1); assert.equal(result[0].part.tokens.output, 7); assert.equal(result[0].part.tokens.input, 100); assert.equal(result[0].sessionId, "test-session");
});

test("AGY completion-only responses and failures are visible", () => {
  const out = normalizeAgyEvent({ event: "result", result: { status: "SUCCESS", response: "done" } }, createAgyStreamState());
  assert.equal(out[0].text, "done");
  const state = createAgyStreamState();
  const failed = normalizeAgyEvent({ event: "result", result: { status: "ERROR", error: "quota exhausted" } }, state);
  assert.equal(state.failed, true); assert.equal(failed[0].message, "quota exhausted");
});

test("AGY resumes only the specified conversation and preserves configured permissions", () => {
  const args = buildAgyArgs({ prompt: "hello", model: "gemini-3.8-flash-low", sessionId: "old", resumeSessionId: "explicit" });
  assert.ok(args.includes("explicit")); assert.ok(!args.includes("old"));
  assert.ok(!args.includes("--dangerously-skip-permissions")); assert.ok(!args.includes("--continue"));
  assert.throws(() => buildAgyArgs({ forkSession: true }), /branching/);
  assert.throws(() => buildAgyArgs({ images: [{}] }), /image attachments/);
});

test("system proxy fills missing GUI environment without overriding explicit configuration", () => {
  const source = "HTTPEnable : 1\nHTTPProxy : 127.0.0.1\nHTTPPort : 8888\nHTTPSEnable : 1\nHTTPSProxy : 127.0.0.1\nHTTPSPort : 8888";
  const filled = parseSystemProxy(source, { PATH: "/usr/bin" });
  assert.equal(filled.HTTPS_PROXY, "http://127.0.0.1:8888");
  assert.equal(parseSystemProxy(source, { HTTPS_PROXY: "https://explicit.invalid" }).HTTPS_PROXY, "https://explicit.invalid");
  assert.equal(parseSystemProxy(source, { https_proxy: "http://explicit.invalid" }).HTTPS_PROXY, undefined);
  assert.equal(parseSystemProxy(source.replaceAll("Enable : 1", "Enable : 0")).HTTP_PROXY, undefined);
});
