import { describe, expect, it } from "vitest";
import type { ClaudeCliEvent } from "@shared/agent/events";
import { buildClaudeArgs, buildClaudePrompt, buildClaudeRewindArgs, resolveClaudeModelChoice } from "../args";
import { inspectClaudeEvent, parseClaudeStdoutLine, shouldEmitClaudeStderr } from "../parser";
import { buildControlResponse, buildPermissionKey, buildPermissionRequest, buildUserTurn } from "../permissions";
import { buildClaudeAppendPrompt } from "../system-prompt";

// Lines captured from `claude -p --output-format stream-json --verbose
// --include-partial-messages` (Claude Code 2.1.287), trimmed.
const SID = "f8274f26-2631-4d04-9247-50d4465c7334";
const FIXTURE = {
  hookStarted: `{"type":"system","subtype":"hook_started","hook_id":"cf54","hook_name":"SessionStart:startup","hook_event":"SessionStart","uuid":"6d42","session_id":"${SID}"}`,
  hookResponse: `{"type":"system","subtype":"hook_response","hook_id":"55a2","output":"CRITICAL - Code Discovery Protocol","exit_code":0,"outcome":"success","uuid":"x","session_id":"${SID}"}`,
  init: `{"type":"system","subtype":"init","cwd":"/tmp/w","session_id":"${SID}","tools":["Bash"],"model":"claude-haiku-4-5-20251001","permissionMode":"default","claude_code_version":"2.1.287"}`,
  status: `{"type":"system","subtype":"status","status":"requesting","session_id":"${SID}","uuid":"c069"}`,
  thinkingTokens: `{"type":"system","subtype":"thinking_tokens","estimated_tokens":50,"estimated_tokens_delta":50,"session_id":"${SID}","uuid":"078c"}`,
  messageStart: `{"type":"stream_event","event":{"type":"message_start","message":{"model":"claude-haiku-4-5-20251001","id":"msg_011","type":"message","role":"assistant","content":[],"stop_reason":null,"usage":{"input_tokens":10,"cache_creation_input_tokens":17513,"cache_read_input_tokens":20088,"output_tokens":1}}},"session_id":"${SID}","parent_tool_use_id":null,"uuid":"a1"}`,
  thinkingDelta: `{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"","estimated_tokens":50}},"session_id":"${SID}","parent_tool_use_id":null,"uuid":"46e2","thinking_display":"updates"}`,
  textDelta: `{"type":"stream_event","event":{"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"Hey"}},"session_id":"${SID}","parent_tool_use_id":null,"uuid":"f86c"}`,
  toolStart: `{"type":"stream_event","event":{"type":"content_block_start","index":2,"content_block":{"type":"tool_use","id":"toolu_1","name":"AskUserQuestion","input":{}}},"session_id":"${SID}","parent_tool_use_id":null,"uuid":"t1"}`,
  blockStop: `{"type":"stream_event","event":{"type":"content_block_stop","index":1},"session_id":"${SID}","parent_tool_use_id":null,"uuid":"5a04"}`,
  assistant: `{"type":"assistant","message":{"model":"claude-haiku-4-5-20251001","id":"msg_011","type":"message","role":"assistant","content":[{"type":"text","text":"Hey! 👋"}],"stop_reason":null},"parent_tool_use_id":null,"session_id":"${SID}","uuid":"a2"}`,
  rateLimit: `{"type":"rate_limit_event","rate_limit_info":{"status":"allowed","resetsAt":1790904000,"rateLimitType":"five_hour"},"session_id":"${SID}"}`,
  postTurn: `{"type":"system","subtype":"post_turn_summary","status_category":"blocked","session_id":"${SID}"}`,
  result: `{"duration_api_ms":2650,"stop_reason":"end_turn","session_id":"${SID}","total_cost_usd":0.0379,"usage":{"input_tokens":10,"output_tokens":176},"terminal_reason":"completed","is_error":false,"num_turns":1,"subtype":"success","result":"Hey!","type":"result","duration_ms":3297,"uuid":"0392"}`,
};

function eventOf(line: string): ClaudeCliEvent {
  const parsed = parseClaudeStdoutLine(line);
  if (parsed?.kind !== "event") throw new Error(`expected event, got ${parsed?.kind}`);
  return parsed.event;
}

describe("buildClaudeArgs", () => {
  it("keeps the stream flags and orders model / effort / session flags", () => {
    const args = buildClaudeArgs({ model: "opus", effort: "high", sessionId: "s-1", appendSystemPrompt: "P", mcpConfigPath: "/mcp.json" });
    expect(args.slice(0, 9)).toEqual([
      "--print",
      "--input-format=stream-json",
      "--output-format=stream-json",
      "--verbose",
      "--include-partial-messages",
      "--permission-mode",
      "bypassPermissions",
      "--permission-prompt-tool",
      "stdio",
    ]);
    expect(args.slice(9)).toEqual(["--append-system-prompt", "P", "--mcp-config", "/mcp.json", "--model", "opus", "--effort", "high", "--session-id", "s-1"]);
  });

  it("resumes (optionally forking) instead of creating a session", () => {
    const args = buildClaudeArgs({ resumeSessionId: "r-1", sessionId: "ignored", forkSession: true, appendSystemPrompt: "P" });
    expect(args.slice(-3)).toEqual(["--resume", "r-1", "--fork-session"]);
    expect(args).not.toContain("--session-id");
    expect(args).not.toContain("--effort");
  });

  it("builds the rewind invocation", () => {
    expect(buildClaudeRewindArgs("s", "u")).toEqual(["--print", "--resume", "s", "--rewind-files", "u"]);
  });
});

describe("resolveClaudeModelChoice", () => {
  it("passes registry-validated effort, dropping it for Haiku / unknown / upstream models", () => {
    expect(resolveClaudeModelChoice("opus", "max", false)).toEqual({ model: "opus", effort: "max" });
    expect(resolveClaudeModelChoice("fable[1m]", "xhigh", false)).toEqual({ model: "fable[1m]", effort: "xhigh" });
    expect(resolveClaudeModelChoice("haiku", "high", false)).toEqual({ model: "haiku", effort: null });
    expect(resolveClaudeModelChoice("claude-custom-1", "high", false)).toEqual({ model: "claude-custom-1", effort: null });
    expect(resolveClaudeModelChoice("sonnet", "high", true)).toEqual({ model: "sonnet", effort: null });
    expect(resolveClaudeModelChoice("sonnet", undefined, false)).toEqual({ model: "sonnet", effort: null });
    // `ultra` is Codex-only: clamped to the strongest Claude level.
    expect(resolveClaudeModelChoice("sonnet", "ultra", false)).toEqual({ model: "sonnet", effort: "max" });
    expect(resolveClaudeModelChoice("claude-opus", undefined, false).model).toBe("opus");
  });
});

describe("prompts", () => {
  it("adds remote + project context to the appended system prompt", () => {
    const prompt = buildClaudeAppendPrompt({ remote: true, remoteChannelInstructions: "CHANNEL", projectContext: " ctx " });
    expect(prompt).toContain("REMOTE SSH RUNTIME:");
    expect(prompt).toContain("\n\nCHANNEL\n\nPROJECT CONTEXT (set in RayLine for this project):\nctx");
    expect(buildClaudeAppendPrompt({ remote: false, remoteChannelInstructions: "CHANNEL" })).not.toContain("CHANNEL");
  });

  it("lists attachment paths before the user prompt", () => {
    expect(buildClaudePrompt({ prompt: "hi", imageCount: 1, imagePaths: ["/t/a.png"], files: [{ type: "file", path: "/f.txt" }], remote: false })).toBe(
      "[Attached files:\n/f.txt]\n\n[Attached images: /t/a.png]\n\nhi",
    );
    expect(buildClaudePrompt({ prompt: "hi", imageCount: 1, imagePaths: [], files: [], remote: true })).toContain("were not copied to the remote SSH host");
  });
});

describe("parseClaudeStdoutLine", () => {
  it("forwards modelled events and drops hook / telemetry noise", () => {
    expect(parseClaudeStdoutLine(FIXTURE.hookStarted)).toEqual({ kind: "ignored", type: "system/hook_started", reason: "noise" });
    expect(parseClaudeStdoutLine(FIXTURE.hookResponse)?.kind).toBe("ignored");
    expect(parseClaudeStdoutLine(FIXTURE.thinkingTokens)?.kind).toBe("ignored");
    expect(parseClaudeStdoutLine(FIXTURE.postTurn)?.kind).toBe("ignored");
    expect(parseClaudeStdoutLine(FIXTURE.rateLimit)).toEqual({ kind: "ignored", type: "rate_limit_event", reason: "unknown" });
    for (const line of [FIXTURE.init, FIXTURE.status, FIXTURE.messageStart, FIXTURE.textDelta, FIXTURE.assistant, FIXTURE.result]) {
      expect(parseClaudeStdoutLine(line)?.kind).toBe("event");
    }
  });

  it("handles blank, non-JSON and malformed lines", () => {
    expect(parseClaudeStdoutLine("   ")).toBeNull();
    expect(parseClaudeStdoutLine("not json")).toEqual({ kind: "invalid", preview: "not json" });
    expect(parseClaudeStdoutLine('{"type":"assistant","message":{}}')?.kind).toBe("invalid");
    expect(parseClaudeStdoutLine('{"type":"stream_event","event":{"type":"brand_new"}}')?.kind).toBe("ignored");
  });

  it("recognises the permission control protocol", () => {
    const request = parseClaudeStdoutLine(
      '{"type":"control_request","request_id":"req-1","request":{"subtype":"can_use_tool","tool_name":"Write","input":{"file_path":"/x"},"tool_use_id":"tu"}}',
    );
    expect(request).toMatchObject({ kind: "permission-request", requestId: "req-1", request: { tool_name: "Write" } });
    expect(parseClaudeStdoutLine('{"type":"control_cancel_request","cancel_request_id":"req-1"}')).toEqual({ kind: "permission-cancel", requestId: "req-1" });
    expect(parseClaudeStdoutLine('{"type":"control_request","request_id":"r","request":{"subtype":"interrupt"}}')).toEqual({ kind: "control-other", type: "control_request" });
    expect(parseClaudeStdoutLine('{"type":"control_response","response":{}}')?.kind).toBe("control-other");
  });
});

describe("inspectClaudeEvent", () => {
  it("derives lifecycle signals", () => {
    expect(inspectClaudeEvent(eventOf(FIXTURE.thinkingDelta))).toMatchObject({ thinkingDelta: true, assistantText: false });
    expect(inspectClaudeEvent(eventOf(FIXTURE.textDelta)).assistantText).toBe(true);
    expect(inspectClaudeEvent(eventOf(FIXTURE.assistant)).assistantText).toBe(true);
    expect(inspectClaudeEvent(eventOf(FIXTURE.toolStart)).toolUseStarted).toBe("AskUserQuestion");
    expect(inspectClaudeEvent(eventOf(FIXTURE.blockStop)).blockStopped).toBe(true);
    expect(inspectClaudeEvent(eventOf(FIXTURE.result)).result?.session_id).toBe(SID);
    expect(inspectClaudeEvent(eventOf(FIXTURE.init))).toMatchObject({ result: null, toolUseStarted: null });
  });
});

describe("shouldEmitClaudeStderr", () => {
  const base = { stderr: "boom", result: null, exitCode: 1, signal: null, cancelled: false, stoppedForQuestion: false };
  it("surfaces stderr only for failed runs", () => {
    expect(shouldEmitClaudeStderr(base)).toBe(true);
    expect(shouldEmitClaudeStderr({ ...base, exitCode: 0 })).toBe(false);
    expect(shouldEmitClaudeStderr({ ...base, cancelled: true })).toBe(false);
    expect(shouldEmitClaudeStderr({ ...base, stoppedForQuestion: true })).toBe(false);
    expect(shouldEmitClaudeStderr({ ...base, stderr: "  " })).toBe(false);
    const failed = eventOf(FIXTURE.result.replace('"is_error":false', '"is_error":true'));
    expect(shouldEmitClaudeStderr({ ...base, exitCode: 0, result: failed.type === "result" ? failed : null })).toBe(true);
  });
});

describe("permissions", () => {
  it("summarises the request for the renderer", () => {
    const payload = buildPermissionRequest("c1", "req", { subtype: "can_use_tool", tool_name: "Bash", input: { command: "rm -rf x" } });
    expect(payload).toMatchObject({ conversationId: "c1", summary: "rm -rf x", targetPath: null, isSensitiveFile: false, allowKey: "Bash::rm -rf x" });
    const blocked = buildPermissionRequest("c1", "req", { subtype: "can_use_tool", tool_name: "Edit", input: { file_path: "/a" }, blocked_path: "/b" });
    expect(blocked).toMatchObject({ summary: "/b", targetPath: "/b", isSensitiveFile: true, allowKey: "Edit::/b" });
    expect(buildPermissionRequest("c", "r", { subtype: "can_use_tool", tool_name: "", input: {} }).summary).toBe("Tool request");
    expect(buildPermissionKey("WebFetch", { url: "https://x" }, null)).toBe("WebFetch::");
  });

  it("builds stdin control lines", () => {
    expect(buildControlResponse("r", { behavior: "deny", message: "no" })).toEqual({
      type: "control_response",
      response: { subtype: "success", request_id: "r", response: { behavior: "deny", message: "no" } },
    });
    expect(buildUserTurn("hi")).toEqual({ type: "user", message: { role: "user", content: "hi" } });
  });
});
