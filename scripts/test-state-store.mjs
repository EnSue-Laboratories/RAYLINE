import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createStateStore } from "../electron/state-store.cjs";

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rayline-state-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return path.join(dir, "state.json");
}

test("rapid saves leave the latest complete snapshot without truncating content", async (t) => {
  const file = fixture(t);
  const store = createStateStore(file);
  const huge = "完整正文".repeat(100_000);
  const state = { text: huge, args: { output: huge }, pmRepos: ["repo"] };
  await Promise.all([store.save({ old: true }), store.save(state)]);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), state);
  assert.deepEqual(fs.readdirSync(path.dirname(file)), ["state.json"]);
});

test("close-time sync save supersedes an async write already in flight", async (t) => {
  const file = fixture(t);
  let started;
  const writing = new Promise((resolve) => { started = resolve; });
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const io = { ...fs, promises: { ...fs.promises, writeFile: async (...args) => {
    started(); await gate; return fs.promises.writeFile(...args);
  } } };
  const store = createStateStore(file, io);
  const old = store.save({ active: "old" });
  await writing;
  store.saveSync({ active: "latest", pmRepos: ["preserved"] });
  release();
  await old;
  assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), { active: "latest", pmRepos: ["preserved"] });
  assert.deepEqual(fs.readdirSync(path.dirname(file)), ["state.json"]);
});

test("failed save retains previous valid state and subsequent saves recover", async (t) => {
  const file = fixture(t);
  fs.writeFileSync(file, JSON.stringify({ good: true }));
  let fail = true;
  const io = { ...fs, promises: { ...fs.promises, writeFile: async (...args) => {
    if (fail) { fail = false; throw new Error("disk full"); }
    return fs.promises.writeFile(...args);
  } } };
  const store = createStateStore(file, io);
  await assert.rejects(store.save({ bad: true }), /disk full/);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), { good: true });
  await store.save({ recovered: true });
  assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), { recovered: true });
});
