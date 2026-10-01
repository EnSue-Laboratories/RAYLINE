// Ported from PR #230 scripts/test-grok.mjs (main-process assertions; the
// model-option assertions live in shared/models/__tests__).
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AgentDonePayload, AgentErrorPayload, AgentStreamPayload } from "@shared/agent/events";
import type { AgentEventSink } from "../../../agent-sink";
import { readGrokCatalog } from "../../model-catalog";
import { buildGrokArgs, resolveGrokModelFlag } from "../args";
import { createGrokStreamState, normalizeGrokEvent, parseGrokLine, toGrokTokens } from "../parser";

const NOW = 1_700_000_000_000;

describe("buildGrokArgs", () => {
  it("resumes the native session (optionally forked) before --continue", () => {
    expect(buildGrokArgs({ cwd: "/w", model: "grok-4.7", resumeSessionId: "s1", sessionId: "old", forkSession: true, grokContinue: true, prompt: "p" })).toEqual([
      "--cwd",
      "/w",
      "--output-format",
      "streaming-json",
      "--always-approve",
      "--model",
      "grok-4.7",
      "--resume",
      "s1",
      "--fork-session",
      "--single",
      "p",
    ]);
    expect(buildGrokArgs({ cwd: "/w", grokContinue: true, prompt: "p" })).toContain("--continue");
  });

  it("omits --model for the CLI default", () => {
    expect(resolveGrokModelFlag("")).toBeNull();
    expect(resolveGrokModelFlag("grok-default")).toBeNull();
    expect(buildGrokArgs({ cwd: "/w", model: "", prompt: "p" })).not.toContain("--model");
  });
});

describe("normalizeGrokEvent", () => {
  it("tags text / thought deltas and tracks the session id", () => {
    const state = createGrokStreamState();
    expect(normalizeGrokEvent({ type: "text", data: "Hel", sessionId: "g1" }, state, NOW)).toEqual([{ provider: "grok", timestamp: NOW, type: "text", text: "Hel" }]);
    expect(normalizeGrokEvent({ type: "thought", text: "hmm" }, state, NOW)).toEqual([{ provider: "grok", timestamp: NOW, type: "reasoning", reasoning: "hmm" }]);
    expect(normalizeGrokEvent({ type: "text", data: "" }, state, NOW)).toEqual([]);
    expect(state.sessionId).toBe("g1");
  });

  it("keeps tool name / input from tool_call on its update", () => {
    const state = createGrokStreamState();
    const [call] = normalizeGrokEvent({ type: "tool_call", toolCallId: "t1", toolName: "bash", rawInput: { cmd: "ls" } }, state, NOW);
    const [update] = normalizeGrokEvent({ type: "tool_call_update", toolCallId: "t1", rawOutput: "a\nb" }, state, NOW);
    expect(call).toMatchObject({ type: "tool_use", id: "t1", name: "bash", status: "in_progress" });
    expect(update).toEqual({ provider: "grok", timestamp: NOW, type: "tool_use", id: "t1", name: "bash", input: { cmd: "ls" }, output: "a\nb", status: "completed" });
  });

  it("maps usage / end to step_finish without null fields", () => {
    const state = createGrokStreamState("g1");
    const [usage] = normalizeGrokEvent({ type: "usage", usage: { inputTokens: 10, output_tokens: 2 } }, state, NOW);
    expect(usage).toEqual({
      provider: "grok",
      timestamp: NOW,
      type: "step_finish",
      reason: "usage",
      part: { id: "grok-usage-1", tokens: { input: 10, output: 2, reasoning: 0, cache: { read: 0, write: 0 } } },
    });
    const [end] = normalizeGrokEvent({ type: "end", stopReason: "end_turn" }, state, NOW);
    expect(end).toEqual({ provider: "grok", timestamp: NOW, type: "step_finish", reason: "end_turn", sessionId: "g1" });
    expect(toGrokTokens({ total_tokens: 9 })?.total).toBe(9);
  });

  it("emits structured errors and wraps plain output as text", () => {
    const state = createGrokStreamState();
    expect(normalizeGrokEvent({ type: "error", message: "Unknown model id: grok-4.7" }, state, NOW)).toEqual([
      { provider: "grok", timestamp: NOW, type: "error", message: "Unknown model id: grok-4.7", error: "Unknown model id: grok-4.7" },
    ]);
    expect(parseGrokLine("plain", state, NOW)).toEqual({ kind: "text", event: { type: "text", provider: "grok", text: "plain\n", timestamp: NOW } });
  });
});

describe("Grok model discovery", () => {
  it("returns no guessed ids when discovery fails", async () => {
    const failing = (_bin: string, _args: readonly string[], _options: unknown, done: (err: Error | null, stdout: string, stderr: string) => void): void =>
      done(new Error("timeout"), "- grok-4.7", "");
    await expect(readGrokCatalog({ bin: "fixture", runCli: failing })).resolves.toEqual([]);
    const ok = (_bin: string, _args: readonly string[], _options: unknown, done: (err: Error | null, stdout: string, stderr: string) => void): void =>
      done(null, " * grok-4.6 (default)\n - grok-4.7\n", "");
    await expect(readGrokCatalog({ bin: "fixture", runCli: ok })).resolves.toEqual(["grok-4.6", "grok-4.7"]);
  });
});

describe("Grok CLI failure", () => {
  let dir = "";
  const previousBin = process.env.GROK_BIN;

  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "rayline-grok-error-"));
    const bin = path.join(dir, "grok-fixture.cjs");
    await writeFile(
      bin,
      `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[args.indexOf('--model') + 1] !== 'grok-4.7') process.exit(2);
const message = 'Unknown model id: grok-4.7';
console.log(JSON.stringify({ type: 'error', message }));
console.error(message);
process.exitCode = 1;
`,
    );
    await chmod(bin, 0o755);
    process.env.GROK_BIN = bin;
  });

  afterAll(async () => {
    if (previousBin === undefined) delete process.env.GROK_BIN;
    else process.env.GROK_BIN = previousBin;
    await rm(dir, { recursive: true, force: true });
  });

  it("produces one visible error even when stderr repeats the streamed error", async () => {
    const { startGrokAgent, cancelGrokAgent } = await import("../session");
    const streams: AgentStreamPayload[] = [];
    const errors: AgentErrorPayload[] = [];
    const done = await new Promise<AgentDonePayload>((resolve, reject) => {
      const timer = setTimeout(() => {
        cancelGrokAgent("fixture");
        reject(new Error("CLI fixture timed out"));
      }, 5000);
      const sink: AgentEventSink = {
        isClosed: () => false,
        stream: (payload) => streams.push(payload),
        error: (payload) => errors.push(payload),
        done: (payload) => {
          clearTimeout(timer);
          resolve(payload);
        },
        permissionRequest: () => {},
        permissionCancelled: () => {},
      };
      void startGrokAgent({ conversationId: "fixture", cwd: dir, model: "grok-4.7", prompt: "fixture" }, sink);
    });
    expect(done).toMatchObject({ provider: "grok", exitCode: 1 });
    expect(streams.filter((p) => p.event.type === "error")).toHaveLength(1);
    expect(errors).toHaveLength(0);
  });
});
