import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@shared/chat/types";
import { normalizeCodexToolArgs, normalizeCodexToolResult } from "../codexEvents";
import { assistant, convo, lastAssistant, parts, run } from "./helpers";

const user: ChatMessage = { id: "u1", role: "user", text: "hi" };

describe("Codex exec events", () => {
  it("captures the thread id from thread.started and session_meta", () => {
    expect(run(convo([user]), { type: "thread.started", thread_id: "th-1" }).result?._codexThreadId).toBe("th-1");
    expect(run(convo([user]), { type: "session_meta", payload: { id: "th-2" } }).result?._codexThreadId).toBe("th-2");
  });

  it("turn.started ensures an assistant", () => {
    const { result } = run(convo([user]), { type: "turn.started" });
    expect(lastAssistant(result)).toMatchObject({ role: "assistant", parts: [], isStreaming: true });
  });

  it("command items start running and complete in place", () => {
    const { result } = run(
      convo([user]),
      { type: "item.started", item: { id: "i1", type: "command_execution", command: "ls", aggregated_output: "" } },
      { type: "item.completed", item: { id: "i1", type: "command_execution", command: "ls", aggregated_output: "a\nb" } },
      { type: "item.completed", item: { id: "i2", type: "command_execution", command: "pwd", aggregated_output: "/x" } },
      { type: "item.completed", item: { id: "m1", type: "agent_message", text: "done" } },
      { type: "item.updated", item: { id: "i3", type: "command_execution", command: "x", aggregated_output: "" } },
    );
    expect(parts(result)).toEqual([
      { type: "tool", id: "i1", name: "ls", args: { command: "ls" }, result: "a\nb", status: "done" },
      { type: "tool", id: "i2", name: "pwd", args: { command: "pwd" }, result: "/x", status: "done" },
      { type: "text", text: "done" },
    ]);
  });

  it("turn.completed merges fallback usage and finalizes", () => {
    const { result } = run(convo([user, assistant()]), { type: "turn.completed", usage: { input_tokens: 5, cached_input_tokens: 2, output_tokens: 7 } });
    const message = lastAssistant(result);
    expect(result?.isStreaming).toBe(false);
    expect(message.isStreaming).toBe(false);
    expect(message._usage).toMatchObject({ input_tokens: 5, output_tokens: 7, cache_read_input_tokens: 2 });
  });

  it("turn.failed only materializes the entry", () => {
    const base = convo([user]);
    expect(run(base, { type: "turn.failed", message: "x" }).result).toBe(base);
  });
});

describe("Codex legacy rollout events", () => {
  it("token_count sets usage and normalized rate limits", () => {
    const { result } = run(convo([user]), {
      type: "event_msg",
      payload: {
        type: "token_count",
        info: { last_token_usage: { input_tokens: 1, output_tokens: 2, total_tokens: 3 }, model_context_window: 1000 },
        rate_limits: { primary: { used_percent: 50, window_minutes: 300 }, secondary: { used_percent: Number.NaN }, plan_type: "plus" },
      },
    });
    const message = lastAssistant(result);
    expect(message._usage).toEqual({ input_tokens: 1, output_tokens: 2, total_tokens: 3, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, context_window: 1000 });
    expect(message._rateLimits).toEqual({ five_hour: { used_percent: 50, resets_at: null, window_minutes: 300 }, plan_type: "plus" });
  });

  it("task_started records the context window; task_complete adds missing text and stops", () => {
    const started = run(convo([user]), { type: "event_msg", payload: { type: "task_started", model_context_window: 400 } }).result;
    expect(lastAssistant(started)._usage).toMatchObject({ context_window: 400 });
    const done = run(started, { type: "event_msg", payload: { type: "task_complete", last_agent_message: "final" } }).result;
    expect(parts(done)).toEqual([{ type: "text", text: "final" }]);
    expect(done?.isStreaming).toBe(false);
    const withText = run(convo([user, assistant([{ type: "text", text: "kept" }])]), { type: "event_msg", payload: { type: "task_complete", last_agent_message: "final" } }).result;
    expect(parts(withText)).toEqual([{ type: "text", text: "kept" }]);
  });

  it("response_item: assistant text + images, tool calls and outputs", () => {
    const { result } = run(
      convo([user]),
      { type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "ignored" }] } },
      { type: "response_item", payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: "A" }, { type: "output_text", text: "B" }, { type: "output_image", image_url: { url: "https://x/i.png" } }] } },
      { type: "response_item", payload: { type: "function_call", name: "shell", call_id: "c1", arguments: '{"cmd":"ls"}' } },
      { type: "response_item", payload: { type: "function_call_output", call_id: "c1", output: '{"ok":true}' } },
      { type: "response_item", payload: { type: "function_call", name: "shell", call_id: "c1", arguments: '{"cmd":"ls -la"}', status: "completed" } },
      { type: "response_item", payload: { type: "custom_tool_call_output", call_id: "c2", output: "plain" } },
    );
    expect(parts(result)).toEqual([
      { type: "text", text: "AB" },
      expect.objectContaining({ type: "image", src: "https://x/i.png", alt: "" }),
      { type: "tool", id: "c1", name: "shell", args: { cmd: "ls -la", command: "ls -la" }, result: { ok: true }, status: "done" },
      { type: "tool", id: "c2", name: "tool", args: {}, result: "plain", status: "done" },
    ]);
  });

  it("normalizes tool args and results", () => {
    expect(normalizeCodexToolArgs({ type: "custom_tool_call", input: "raw patch" })).toEqual({ input: "raw patch" });
    expect(normalizeCodexToolArgs({ type: "function_call", arguments: "not json" })).toEqual({ value: "not json" });
    expect(normalizeCodexToolArgs({ type: "function_call", arguments: 5 })).toEqual({ value: 5 });
    expect(normalizeCodexToolArgs({ type: "function_call" })).toEqual({});
    expect(normalizeCodexToolResult(" [1,2] ")).toEqual([1, 2]);
    expect(normalizeCodexToolResult("{broken")).toBe("{broken");
    expect(normalizeCodexToolResult(3)).toBe(3);
  });
});
