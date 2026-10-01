// Ported from PR #230 scripts/test-agy.mjs (main-process assertions; the
// model-catalog / model-option assertions live in shared/models/__tests__).
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { OpenCodeCliEvent } from "@shared/agent/events";
import { readAgyCatalog, type CliRunner } from "../../model-catalog";
import { parseSystemProxy } from "../../runtime-env";
import { buildAgyArgs, resolveAgyModelFlag } from "../args";
import { createAgyStreamState, normalizeAgyEvent, parseAgyLine } from "../parser";
import { agyExitCode } from "../session";

const NOW = 1_700_000_000_000;

function only<T extends OpenCodeCliEvent["type"]>(events: OpenCodeCliEvent[], type: T): Extract<OpenCodeCliEvent, { type: T }> {
  const match = events.find((e): e is Extract<OpenCodeCliEvent, { type: T }> => e.type === type);
  if (!match) throw new Error(`no ${type} event`);
  return match;
}

describe("normalizeAgyEvent", () => {
  it("normalizes deltas, completed tools and resumed usage without duplicate text", () => {
    const state = createAgyStreamState();
    normalizeAgyEvent({ event: "init", conversation_id: "test-session" }, state, NOW);
    const tool = only(
      normalizeAgyEvent(
        { event: "step_update", step_update: { step_index: 2, step_type: "tool", state: "ACTIVE", tool_name: "run_command", tool_info: { parameters: { CommandLine: "pwd" } } } },
        state,
        NOW,
      ),
      "tool_use",
    );
    const done = only(normalizeAgyEvent({ event: "step_update", step_update: { step_index: 2, step_type: "tool", state: "DONE", tool_info: { output: "/workspace" } } }, state, NOW), "tool_use");
    expect(done.id).toBe(tool.id);
    expect(done.status).toBe("completed");
    expect(done.name).toBe("run_command");
    expect(done.input).toEqual({ CommandLine: "pwd" });
    expect(done.output).toBe("/workspace");

    normalizeAgyEvent({ event: "step_update", step_update: { step_index: 3, step_type: "agent_response", text_delta: "你好", usage: { input_tokens: 100, output_tokens: 7, thinking_tokens: 2 } } }, state, NOW);
    const result = normalizeAgyEvent({ event: "result", result: { status: "SUCCESS", response: "你好", usage: { input_tokens: 900000, output_tokens: 10000 } } }, state, NOW);
    expect(result).toHaveLength(1);
    const finish = only(result, "step_finish");
    expect(finish.part?.tokens).toEqual({ input: 100, output: 7, reasoning: 2, cache: { read: 0, write: 0 } });
    expect(finish.sessionId).toBe("test-session");
    expect(finish.provider).toBe("agy");
  });

  it("makes completion-only responses and failures visible", () => {
    expect(only(normalizeAgyEvent({ event: "result", result: { status: "SUCCESS", response: "done" } }, createAgyStreamState(), NOW), "text").text).toBe("done");
    const state = createAgyStreamState();
    const failed = normalizeAgyEvent({ event: "result", result: { status: "ERROR", error: "quota exhausted" } }, state, NOW);
    expect(state.failed).toBe(true);
    expect(only(failed, "error").message).toBe("quota exhausted");
    expect(only(failed, "step_finish").reason).toBe("error");
    expect(agyExitCode(true, 0)).toBe(1);
    expect(agyExitCode(false, 0)).toBe(0);
  });

  it("omits absent fields and ignores non-JSON lines", () => {
    const [start] = normalizeAgyEvent({ event: "init" }, createAgyStreamState(), NOW);
    expect(start).toEqual({ provider: "agy", timestamp: NOW, type: "step_start" });
    expect(parseAgyLine("Logging in…", createAgyStreamState(), NOW)).toBeNull();
    expect(parseAgyLine('{"event":"init"}', createAgyStreamState(), NOW)?.isEvent).toBe(true);
  });
});

describe("buildAgyArgs", () => {
  it("resumes only the specified conversation and preserves configured permissions", () => {
    const args = buildAgyArgs({ prompt: "hello", model: "gemini-3.8-flash-low", sessionId: "old", resumeSessionId: "explicit" });
    expect(args).toContain("explicit");
    expect(args).not.toContain("old");
    expect(args).not.toContain("--dangerously-skip-permissions");
    expect(args).not.toContain("--continue");
    expect(() => buildAgyArgs({ forkSession: true })).toThrow(/branching/);
    expect(() => buildAgyArgs({ images: [{}] })).toThrow(/image attachments/);
  });

  it("omits --model for the CLI default and accepts agy: ids", () => {
    expect(resolveAgyModelFlag("")).toBeNull();
    expect(resolveAgyModelFlag("agy:default")).toBeNull();
    expect(resolveAgyModelFlag("agy:claude-sonnet-4-6")).toBe("claude-sonnet-4-6");
    expect(buildAgyArgs({ prompt: "x" })).not.toContain("--model");
  });
});

describe("parseSystemProxy", () => {
  it("fills missing GUI environment without overriding explicit configuration", () => {
    const source = "HTTPEnable : 1\nHTTPProxy : 127.0.0.1\nHTTPPort : 8888\nHTTPSEnable : 1\nHTTPSProxy : 127.0.0.1\nHTTPSPort : 8888";
    expect(parseSystemProxy(source, { PATH: "/usr/bin" }).HTTPS_PROXY).toBe("http://127.0.0.1:8888");
    expect(parseSystemProxy(source, { HTTPS_PROXY: "https://explicit.invalid" }).HTTPS_PROXY).toBe("https://explicit.invalid");
    expect(parseSystemProxy(source, { https_proxy: "http://explicit.invalid" }).HTTPS_PROXY).toBeUndefined();
    expect(parseSystemProxy(source.replaceAll("Enable : 1", "Enable : 0")).HTTP_PROXY).toBeUndefined();
  });
});

describe("readAgyCatalog", () => {
  let dir = "";
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("keeps models across a cold start and a later network timeout", async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "rayline-agy-catalog-"));
    const cacheFile = path.join(dir, "models.json");
    const success: CliRunner = (_bin, _args, _options, done) => done(null, "gemini-test\tTest Gemini", "");
    const first = await readAgyCatalog({ cacheFile, bin: "test-agy", runCli: success });
    expect(first).toEqual([{ slug: "gemini-test", name: "Test Gemini" }]);

    let calls = 0;
    const failed: CliRunner = (_bin, _args, _options, done) => {
      calls += 1;
      done(new Error("network timeout"), "", "");
    };
    expect(await readAgyCatalog({ cacheFile, bin: "test-agy", runCli: failed })).toEqual(first);
    expect(calls).toBe(0);

    await writeFile(cacheFile, JSON.stringify({ checkedAt: 0, models: first }));
    expect(await readAgyCatalog({ cacheFile, bin: "test-agy", runCli: failed })).toEqual(first);
    expect(calls).toBe(1);
  });
});
