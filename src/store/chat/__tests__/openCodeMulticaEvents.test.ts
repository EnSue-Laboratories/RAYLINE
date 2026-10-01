import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@shared/chat/types";
import { isImmediateFlushEvent } from "../applyStreamEvent";
import { assistant, convo, lastAssistant, parts, run } from "./helpers";

const user: ChatMessage = { id: "u1", role: "user", text: "hi" };

describe("OpenCode events", () => {
  it("captures the session id and upserts parts sorted by start time", () => {
    const { result } = run(
      convo([user]),
      { type: "step_start", sessionID: "oc-1" },
      { type: "text", part: { id: "p2", text: "second", time: { start: 20 } } },
      { type: "tool_use", part: { id: "p1", callID: "call-1", tool: "bash", state: { status: "running", input: { cmd: "ls" }, time: { start: 10 } } } },
      { type: "tool_use", part: { callID: "call-1", tool: "bash", state: { status: "completed", input: { cmd: "ls" }, output: "out", time: { start: 10 } } } },
      { type: "text", part: { id: "p2", text: "second (edited)", time: { start: 20 } } },
    );
    expect(result?._opencodeSessionId).toBe("oc-1");
    expect(parts(result)).toEqual([
      { type: "tool", id: "call-1", name: "Bash", args: { cmd: "ls", command: "ls" }, result: "out", status: "done", _opencodeTime: 10 },
      { type: "text", id: "p2-text-0", text: "second (edited)", _opencodeTime: 20 },
    ]);
    expect(lastAssistant(result).isThinking).toBe(false);
  });

  it("reasoning parts track thinking until they carry an end time", () => {
    const thinking = run(convo([user]), { type: "reasoning", part: { id: "r1", text: "plan", time: { start: 1 } } }).result;
    expect(lastAssistant(thinking).isThinking).toBe(true);
    const ended = run(thinking, { type: "reasoning", part: { id: "r1", text: "plan", time: { start: 1, end: 6 } } }).result;
    expect(lastAssistant(ended).isThinking).toBe(false);
    expect(parts(ended)).toEqual([{ type: "thinking", id: "r1", text: "plan", _opencodeTime: 1, durationMs: 5 }]);
  });

  it("splits <think> tags and `Thinking:` stdout lines into thinking parts", () => {
    const tagged = run(convo([user]), { type: "text", id: "t", timestamp: 5, text: "a <think>why</think> b" }).result;
    expect(parts(tagged).map((p) => [p.type, p.type === "text" || p.type === "thinking" ? p.text : ""])).toEqual([
      ["text", "a "],
      ["thinking", "why"],
      ["text", " b"],
    ]);
    const stdout = run(convo([user]), { type: "opencode_stdout", text: "Thinking: deep\n" }).result;
    expect(parts(stdout)[0]).toMatchObject({ type: "thinking", text: "deep" });
  });

  it("step_finish accumulates cost and stops on a terminal reason", () => {
    const step = { type: "step_finish" as const, part: { tokens: { input: 3, output: 4, cache: { read: 1 } }, cost: 0.5 } };
    const first = run(convo([user, assistant()]), step).result;
    expect(first?.isStreaming).toBe(true);
    const second = run(first, { ...step, reason: "stop" }).result;
    expect(lastAssistant(second)._usage).toMatchObject({ input_tokens: 3, output_tokens: 4, cache_read_input_tokens: 1, cost_usd: 1 });
    expect(second?.isStreaming).toBe(false);
    expect(lastAssistant(second).isStreaming).toBe(false);
  });

  it("error (OpenCode and Codex share the type) appends an error and stops", () => {
    const { result } = run(convo([user]), { type: "error", error: { data: { message: "quota" } } });
    expect(parts(result)).toEqual([{ type: "text", text: "**Error:** quota" }]);
    expect(result?.isStreaming).toBe(false);
    const codex = run(convo([user]), { type: "error", message: "auth failed" }).result;
    expect(parts(codex)).toEqual([{ type: "text", text: "**Error:** auth failed" }]);
  });
});

describe("Multica events", () => {
  it("user echoes and unknown frames only mark the connection", () => {
    const base = convo([user]);
    const echo = run(base, { type: "multica:chat:message", payload: { role: "user" } }).result;
    expect(echo?.multicaConnected).toBe(true);
    expect(echo?.messages).toBe(base.messages);
    expect(run(undefined, { type: "multica:other", payload: {} }).result).toEqual({ messages: [], isStreaming: true, error: null, multicaConnected: true });
  });

  it("agent:status is emitted as an effect, not dispatched by the reducer", () => {
    const agent = { id: "ag", name: "A" };
    const { draft } = run(convo([user]), { type: "multica:agent:status", payload: { agent } });
    expect(draft.effects).toContainEqual({ kind: "multica-agent-status", agent });
  });

  it("pairs tool results with the latest running tool of the same name", () => {
    const { result } = run(
      convo([user]),
      { type: "multica:task:message", payload: { type: "text", content: "hello" } },
      { type: "multica:task:message", payload: { type: "tool_use", tool: "Read", input: { path: "a" } } },
      { type: "multica:task:message", payload: { type: "tool_result", tool: "Read", output: "body" } },
      { type: "multica:task:message", payload: { type: "tool_result", tool: "Grep", output: "orphan" } },
      { type: "multica:task:message", payload: { type: "unknown" } },
    );
    expect(parts(result)).toEqual([
      { type: "text", text: "hello" },
      expect.objectContaining({ type: "tool", name: "Read", args: { path: "a" }, result: "body", status: "done" }),
      expect.objectContaining({ type: "tool", name: "Grep", result: "orphan", status: "done" }),
    ]);
    expect(result?.isStreaming).toBe(true);
  });

  it("completion, cancellation and failure finalize the turn", () => {
    const base = convo([user, assistant()], { error: "old" });
    const done = run(base, { type: "multica:task:completed", payload: {} }).result;
    expect(done).toMatchObject({ isStreaming: false, error: "old" });
    const cancelled = run(base, { type: "multica:task:cancelled", payload: {} }).result;
    expect(cancelled).toMatchObject({ isStreaming: false, error: null });
    const failed = run(base, { type: "multica:task:failed", payload: { reason: "boom" } }).result;
    expect(failed).toMatchObject({ isStreaming: false, error: "task:failed" });
    expect(parts(failed)).toEqual([{ type: "text", text: "_Multica task:failed: boom_" }]);
  });
});

describe("isImmediateFlushEvent", () => {
  it("flags terminal events only", () => {
    expect(isImmediateFlushEvent({ type: "result", subtype: "success", is_error: false })).toBe(true);
    expect(isImmediateFlushEvent({ type: "turn.completed" })).toBe(true);
    expect(isImmediateFlushEvent({ type: "error", message: "x" })).toBe(true);
    expect(isImmediateFlushEvent({ type: "step_finish" })).toBe(true);
    expect(isImmediateFlushEvent({ type: "event_msg", payload: { type: "task_complete" } })).toBe(true);
    expect(isImmediateFlushEvent({ type: "event_msg", payload: { type: "task_started" } })).toBe(false);
    expect(isImmediateFlushEvent({ type: "multica:chat:done", payload: {} })).toBe(true);
    expect(isImmediateFlushEvent({ type: "multica:task:message", payload: {} })).toBe(false);
    expect(isImmediateFlushEvent({ type: "stream_event", event: { type: "ping" } })).toBe(false);
  });

  it("unknown event types never throw and still materialize the entry", () => {
    const unknownEvent: unknown = { type: "brand_new" };
    const { result } = run(undefined, unknownEvent as Parameters<typeof isImmediateFlushEvent>[0]);
    expect(result).toEqual({ messages: [], isStreaming: true, error: null });
  });
});
