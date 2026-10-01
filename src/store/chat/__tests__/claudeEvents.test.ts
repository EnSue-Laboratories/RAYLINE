import { describe, expect, it } from "vitest";
import type { ChatMessage, ToolPart } from "@shared/chat/types";
import { assistant, convo, lastAssistant, parts, run, se } from "./helpers";

const user: ChatMessage = { id: "u1", role: "user", text: "hi" };

describe("Claude stream_event", () => {
  it("creates an assistant on demand and captures the session id", () => {
    const { result, draft } = run(convo([user]), { type: "system", subtype: "init", session_id: "sess-1" });
    expect(result?._claudeSessionId).toBe("sess-1");
    expect(result?.messages).toHaveLength(1);
    expect(draft.effects.some((e) => e.kind === "log")).toBe(true);
  });

  it("message_start overwrites usage; message_delta merges it", () => {
    const { result } = run(
      convo([user]),
      se({ type: "message_start", message: { role: "assistant", content: [], usage: { input_tokens: 10, output_tokens: 1, cache_read_input_tokens: 5, cache_creation_input_tokens: null } } }),
      se({ type: "message_delta", delta: {}, usage: { output_tokens: 42 } }),
    );
    expect(lastAssistant(result)._usage).toEqual({
      input_tokens: 10,
      output_tokens: 42,
      reasoning_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 5,
    });
  });

  it("builds text, thinking, tool and image parts from block starts and deltas", () => {
    const { result } = run(
      convo([user]),
      se({ type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } }),
      se({ type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "hmm" } }),
      se({ type: "content_block_stop", index: 0 }),
      se({ type: "content_block_start", index: 1, content_block: { type: "text", text: "" } }),
      se({ type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "Hi" } }),
      se({ type: "content_block_start", index: 2, content_block: { type: "tool_use", id: "t1", name: "Read", input: {} } }),
      se({ type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: '{"file_path":' } }),
      se({ type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: '"/a"}' } }),
      se({ type: "content_block_delta", index: 2, delta: { type: "signature_delta", signature: "x" } }),
      se({ type: "content_block_start", index: 3, content_block: { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "AAA" } } }),
    );
    const message = lastAssistant(result);
    expect(message.isThinking).toBe(false);
    expect(message.parts).toEqual([
      { type: "thinking", text: "hmm", blockIndex: 0, _streamKey: "0:0" },
      { type: "text", text: "Hi", blockIndex: 1, _streamKey: "0:1" },
      { type: "tool", id: "t1", name: "Read", args: { file_path: "/a" }, argsJson: '{"file_path":"/a"}', result: null, status: "running", blockIndex: 2, _streamKey: "0:2" },
      expect.objectContaining({ type: "image", src: "data:image/jpeg;base64,AAA", mime: "image/jpeg", blockIndex: 3, _streamKey: "0:3" }),
    ]);
    expect(message._streamState?.activeBlocks).toEqual({ 1: "0:1", 2: "0:2", 3: "0:3" });
  });

  it("keeps the last parseable tool args while JSON is partial", () => {
    const { result } = run(
      convo([user]),
      se({ type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "t1", name: "Write", input: {} } }),
      se({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"a":{"b":1}' } }),
    );
    const tool = parts(result)[0] as ToolPart;
    expect(tool.args).toEqual({});
    expect(tool.argsJson).toBe('{"a":{"b":1}');
  });

  it("thinking stays active until its block stops", () => {
    const { result } = run(
      convo([user]),
      se({ type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } }),
    );
    expect(lastAssistant(result).isThinking).toBe(true);
    expect(lastAssistant(result)._streamState?.activeThinking).toEqual({ "0:0": true });
  });

  it("a repeated block index starts a new turn with fresh stream keys", () => {
    const { result } = run(
      convo([user]),
      se({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }),
      se({ type: "content_block_stop", index: 0 }),
      se({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }),
      se({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "second" } }),
    );
    expect(parts(result).map((p) => (p.type === "text" ? [p._streamKey, p.text] : null))).toEqual([["0:0", ""], ["1:0", "second"]]);
  });

  it("ignores unknown block types without touching stream state", () => {
    const { result } = run(convo([user, assistant()]), se({ type: "content_block_start", index: 0, content_block: { type: "redacted_thinking", data: "x" } }));
    expect(lastAssistant(result).parts).toEqual([]);
    expect(lastAssistant(result)._streamState).toBeUndefined();
  });
});

describe("Claude assistant / user / result / system", () => {
  it("assistant event is a fallback only when no stream parts exist", () => {
    const event = {
      type: "assistant" as const,
      message: { role: "assistant" as const, content: [{ type: "text" as const, text: "full" }, { type: "tool_use" as const, id: "t1", name: "Bash", input: { command: "ls" } }] },
    };
    expect(parts(run(convo([user]), event).result)).toEqual([
      { type: "text", text: "full" },
      { type: "tool", id: "t1", name: "Bash", args: { command: "ls" }, result: null, status: "running" },
    ]);
    const existing = assistant([{ type: "text", text: "streamed" }]);
    expect(parts(run(convo([user, existing]), event).result)).toEqual([{ type: "text", text: "streamed" }]);
  });

  it("user event stores the uuid and attaches tool results", () => {
    const tool: ToolPart = { type: "tool", id: "t1", name: "Read", args: {}, result: null, status: "running" };
    const untouched: ChatMessage = { id: "old", role: "assistant", parts: [{ type: "text", text: "x" }] };
    const base = convo([untouched, user, assistant([tool])]);
    const { result } = run(base, {
      type: "user",
      uuid: "uuid-1",
      message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "file body" }] },
    });
    expect(result?.messages[1]).toMatchObject({ role: "user", claudeUuid: "uuid-1" });
    expect(parts(result)[0]).toMatchObject({ result: "file body", status: "done" });
    expect(result?.messages[0]).toBe(untouched);
    expect(tool.status).toBe("running");
  });

  it("result finalizes the turn and stops streaming", () => {
    const { result } = run(convo([user, assistant([], { _compacting: true })]), { type: "result", subtype: "success", is_error: false });
    const message = lastAssistant(result);
    expect(result?.isStreaming).toBe(false);
    expect(message.isStreaming).toBe(false);
    expect(message.isThinking).toBe(false);
    expect(typeof message._elapsedMs).toBe("number");
    expect("_compacting" in message).toBe(false);
  });

  it("error results append an error part", () => {
    const { result } = run(convo([user, assistant()]), { type: "result", subtype: "error_during_execution", is_error: true, errors: ["a", "b"] });
    expect(parts(result)).toEqual([{ type: "error", title: "Error", summary: "a", text: "a\nb" }]);
  });

  it("hook_stopped adds a single paused status", () => {
    const event = { type: "result" as const, subtype: "success", is_error: false, terminal_reason: "hook_stopped" };
    const once = run(convo([user, assistant()]), event).result;
    const twice = run(once, event).result;
    expect(parts(twice).filter((p) => p.type === "status")).toHaveLength(1);
    expect(parts(twice)[0]).toMatchObject({ type: "status", kind: "paused", title: "Paused by hook" });
  });

  it("result without a trailing assistant still stops streaming", () => {
    const { result } = run(convo([user]), { type: "result", subtype: "success", is_error: false });
    expect(result?.isStreaming).toBe(false);
    expect(result?.messages).toEqual([user]);
  });

  it("compact_boundary flags the message; other system events only materialize the entry", () => {
    expect(lastAssistant(run(convo([user]), { type: "system", subtype: "compact_boundary" }).result)._compacting).toBe(true);
    const created = run(undefined, { type: "system", subtype: "init" }).result;
    expect(created).toEqual({ messages: [], isStreaming: true, error: null });
  });

  it("rate_limits and session_snapshot attach to the latest assistant", () => {
    const rateLimits = { five_hour: { used_percent: 10, resets_at: null, window_minutes: 300 } };
    const base = convo([user, assistant(), { id: "u2", role: "user", text: "next" }]);
    const withLimits = run(base, { type: "rate_limits", rate_limits: rateLimits }).result;
    expect(withLimits?.messages[1]).toMatchObject({ _rateLimits: rateLimits });
    const snap = run(withLimits, { type: "session_snapshot", provider: "codex", thread_id: "th", usage: { input_tokens: 3 }, rate_limits: null }).result;
    expect(snap?._codexThreadId).toBe("th");
    expect(snap?.messages[1]).toMatchObject({ _usage: { input_tokens: 3 }, _rateLimits: rateLimits });
  });
});
