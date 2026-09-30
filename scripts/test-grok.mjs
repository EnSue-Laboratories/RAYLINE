import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readGrokCatalog, parseGrokCatalog } from "../electron/model-catalog.cjs";
import { buildRuntimeModels, getAvailableModels, getMOrMulticaFallback } from "../src/data/models.js";
import { visibleModels } from "../src/utils/modelOptions.js";

test("Grok choices follow the CLI catalog while historical selections retain their identity", () => {
  const runtime = buildRuntimeModels({ grok: ["grok-4.6"] });
  const models = getAvailableModels(runtime);
  const choices = visibleModels(models, { grok: true });
  assert.ok(choices.some(m => m.id === "grok-46"));
  assert.ok(choices.some(m => m.id === "grok-default" && !m.cliFlag));
  assert.ok(!choices.some(m => m.id === "grok-47"));
  const saved = getMOrMulticaFallback("grok-47", runtime);
  assert.equal(saved.cliFlag, "grok-4.7"); assert.equal(saved.unavailable, true);
  assert.ok(visibleModels(models, {}, ["grok-47"]).some(m => m.id === "grok-47" && m.unavailable));
  assert.equal(getMOrMulticaFallback("grok-46-continue", runtime).unavailable, false);
  const updated = getAvailableModels(buildRuntimeModels({ grok: ["grok-4.6", "grok-4.7"] }));
  assert.ok(visibleModels(updated).some(m => m.id === "grok-47" && !m.unavailable));
});

test("discovery failure exposes only the native Grok default, not guessed model IDs", async () => {
  assert.deepEqual(await readGrokCatalog({ bin: "fixture", runCli: (_bin, _args, _opts, done) => done(Error("timeout"), "- grok-4.7") }), []);
  assert.deepEqual(visibleModels(getAvailableModels()).filter(m => m.provider === "grok").map(m => m.id), ["grok-default"]);
});

test("Grok discovery accepts catalog rows and ignores warnings, ANSI and duplicates", () => {
  assert.deepEqual(parseGrokCatalog("Model 'grok-4.6' is using its own API key.\nDefault model: grok-4.6\nAvailable models:\n * grok-4.6 (default)\n - \x1b[32mgrok-4.7\x1b[0m\n - grok-4.7\n - not-a-model"), ["grok-4.6", "grok-4.7"]);
});

test("one CLI failure produces one visible error even when stderr repeats the streamed error", async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "rayline-grok-error-"));
  const bin = path.join(dir, "grok-fixture.cjs");
  const previous = process.env.GROK_BIN;
  t.after(async () => { if (previous === undefined) delete process.env.GROK_BIN; else process.env.GROK_BIN = previous; await rm(dir, { recursive: true, force: true }); });
  await writeFile(bin, `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[args.indexOf('--model') + 1] !== 'grok-4.7') process.exit(2);
const message = 'Unknown model id: grok-4.7';
console.log(JSON.stringify({type:'error', message}));
console.error(message);
process.exitCode = 1;
`, { mode: 0o755 });
  process.env.GROK_BIN = bin;
  const { startGrokAgent, cancelGrokAgent } = await import("../electron/grok-agent-manager.cjs");
  const events = [];
  const done = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cancelGrokAgent("fixture"); reject(Error("CLI fixture timed out")); }, 5000);
    startGrokAgent({ conversationId: "fixture", cwd: dir, model: "grok-4.7", prompt: "fixture" }, { send(channel, payload) {
      events.push({ channel, payload });
      if (channel === "agent-done") { clearTimeout(timer); resolve(payload); }
    } });
  });
  assert.equal(done.exitCode, 1);
  assert.equal(events.filter(e => e.channel === "agent-stream" && e.payload.event.type === "error").length, 1);
  assert.equal(events.filter(e => e.channel === "agent-error").length, 0);
  assert.equal(events.filter(e => e.channel === "agent-done").length, 1);
});
