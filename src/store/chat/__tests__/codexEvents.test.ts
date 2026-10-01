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

  it("command items start running, update and complete in place", () => {
    const { result } = run(
      convo([user]),
      { type: "item.started", item: { id: "i1", type: "command_execution", command: "ls", aggregated_output: "" } },
      { type: "item.updated", item: { id: "i1", type: "command_execution", command: "ls", aggregated_output: "a" } },
      { type: "item.completed", item: { id: "i1", type: "command_execution", command: "ls", aggregated_output: "a\nb", exit_code: 0 } },
      { type: "item.completed", item: { id: "i2", type: "command_execution", command: "pwd", aggregated_output: "/x" } },
      { type: "item.completed", item: { id: "m1", type: "agent_message", text: "done" } },
    );
    expect(parts(result)).toEqual([
      { type: "tool", id: "i1", name: "ls", args: { command: "ls" }, result: "a\nb", status: "done" },
      { type: "tool", id: "i2", name: "pwd", args: { command: "pwd" }, result: "/x", status: "done" },
      { type: "text", id: "m1", text: "done" },
    ]);
  });

  it("renders every exec item type", () => {
    const { result } = run(
      convo([user]),
      { type: "item.started", item: { id: "r1", type: "reasoning", text: "plan" } },
      { type: "item.completed", item: { id: "r1", type: "reasoning", text: "plan more" } },
      { type: "item.completed", item: { id: "f1", type: "file_change", changes: [{ path: "src/a.ts", kind: "update" }, { path: "b.md", kind: "add" }], status: "completed" } },
      { type: "item.started", item: { id: "p1", type: "mcp_tool_call", server: "gh", tool: "search", arguments: { q: "x" }, status: "in_progress" } },
      { type: "item.completed", item: { id: "p1", type: "mcp_tool_call", server: "gh", tool: "search", arguments: { q: "x" }, result: { hits: 1 }, status: "completed" } },
      { type: "item.started", item: { id: "c1", type: "collab_tool_call", prompt: "review" } },
      { type: "item.completed", item: { id: "w1", type: "web_search", query: "vite glob" } },
      { type: "item.updated", item: { id: "t1", type: "todo_list", items: [{ text: "a", completed: true }, { text: "b", completed: false }] } },
    );
    const message = lastAssistant(result);
    expect(message.isThinking).toBe(false);
    expect(parts(result)).toEqual([
      { type: "thinking", id: "r1", text: "plan more" },
      { type: "tool", id: "f1", name: "Edit", args: { file_path: "src/a.ts", changes: [{ path: "src/a.ts", kind: "update" }, { path: "b.md", kind: "add" }] }, result: "update src/a.ts\nadd b.md", status: "done" },
      { type: "tool", id: "p1", name: "mcp__gh__search", args: { q: "x" }, result: { hits: 1 }, status: "done" },
      { type: "tool", id: "c1", name: "Agent", args: { description: "review" }, result: null, status: "running" },
      { type: "tool", id: "w1", name: "WebSearch", args: { query: "vite glob" }, result: null, status: "done" },
      { type: "tool", id: "t1", name: "TodoWrite", args: { todos: [{ content: "a", status: "completed" }, { content: "b", status: "pending" }] }, result: null, status: "running" },
    ]);
  });

  it("error items are muted notices, not failures (deduped)", () => {
    const notice = { type: "item.completed" as const, item: { id: "e1", type: "error" as const, message: "Skill descriptions were shortened" } };
    const { result } = run(convo([user]), notice, notice);
    expect(parts(result)).toEqual([{ type: "status", kind: "notice", title: "Notice", text: "Skill descriptions were shortened" }]);
    expect(result?.isStreaming).toBe(true);
    expect(result?.error).toBeNull();
    expect(lastAssistant(result).isStreaming).toBe(true);
  });

  it("turn.completed merges fallback usage and finalizes", () => {
    const { result } = run(convo([user, assistant()]), {
      type: "turn.completed",
      usage: { input_tokens: 5, cached_input_tokens: 2, cache_write_input_tokens: 3, output_tokens: 7, reasoning_output_tokens: 4 },
    });
    const message = lastAssistant(result);
    expect(result?.isStreaming).toBe(false);
    expect(message.isStreaming).toBe(false);
    expect(message._usage).toMatchObject({ input_tokens: 5, output_tokens: 7, cache_read_input_tokens: 2, cache_creation_input_tokens: 3, reasoning_tokens: 4 });
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
