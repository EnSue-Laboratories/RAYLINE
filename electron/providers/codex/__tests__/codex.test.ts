import { describe, expect, it } from "vitest";
import type { CodexCliEvent } from "@shared/agent/events";
import { buildCodexArgs, codexExecutionFlags, codexSandboxModeFromEnv, resolveCodexModelChoice } from "../args";
import { buildCodexMcpOverrides, hasTerminalSessionsServer, parseMcpServers, tomlInlineTable } from "../mcp";
import { inspectCodexEvent, parseCodexLine, shouldEmitCodexStderr } from "../parser";
import { buildCodexPrompt } from "../system-prompt";

// Captured from `codex exec --json` (codex-cli 0.153.4); item text trimmed.
const THREAD = "01a0f992-8b3d-76d2-a4b4-e1608fc3808c";
const FIXTURE = {
  threadStarted: `{"type":"thread.started","thread_id":"${THREAD}"}`,
  warningItem: '{"type":"item.completed","item":{"id":"item_0","type":"error","message":"loading hooks from both hooks.json and config.toml"}}',
  turnStarted: '{"type":"turn.started"}',
  agentMessage: '{"type":"item.completed","item":{"id":"item_2","type":"agent_message","text":"hi"}}',
  turnCompleted:
    '{"type":"turn.completed","usage":{"input_tokens":19643,"cached_input_tokens":11008,"cache_write_input_tokens":0,"output_tokens":5,"reasoning_output_tokens":0}}',
  commandStarted: '{"type":"item.started","item":{"id":"item_3","type":"command_execution","command":"bash -lc ls","aggregated_output":"","exit_code":null,"status":"in_progress"}}',
  commandCompleted: '{"type":"item.completed","item":{"id":"item_3","type":"command_execution","command":"bash -lc ls","aggregated_output":"a\\nb\\n","exit_code":0,"status":"completed"}}',
  fileChange: '{"type":"item.completed","item":{"id":"item_4","type":"file_change","changes":[{"path":"/w/a.ts","kind":"update"}],"status":"completed"}}',
  mcpCall: '{"type":"item.started","item":{"id":"item_5","type":"mcp_tool_call","server":"terminal-sessions","tool":"list_sessions","arguments":{},"status":"in_progress"}}',
  todo: '{"type":"item.updated","item":{"id":"item_6","type":"todo_list","items":[{"text":"x","completed":false}]}}',
  reasoning: '{"type":"item.completed","item":{"id":"item_7","type":"reasoning","text":"**Planning**"}}',
  webSearch: '{"type":"item.completed","item":{"id":"item_8","type":"web_search","query":"codex"}}',
  collab: '{"type":"item.started","item":{"id":"item_9","type":"collab_tool_call","tool":"spawn","status":"in_progress"}}',
  turnFailed: '{"type":"turn.failed","error":{"message":"  stream disconnected  "}}',
  topError: '{"type":"error","message":"model not supported"}',
  sessionMeta: '{"type":"session_meta","payload":{"id":"legacy-1","cwd":"/w"}}',
  taskComplete: '{"type":"event_msg","payload":{"type":"task_complete","last_agent_message":"done"}}',
};

function eventOf(line: string): CodexCliEvent {
  const parsed = parseCodexLine(line);
  if (parsed?.kind !== "event") throw new Error(`expected event, got ${parsed?.kind}`);
  return parsed.event;
}

describe("codex execution flags", () => {
  it("never emits the removed --full-auto flag", () => {
    for (const mode of ["bypass", "workspace-write"] as const) {
      for (const resuming of [false, true]) expect(codexExecutionFlags(mode, resuming)).not.toContain("--full-auto");
    }
  });

  it("uses --sandbox for new sandboxed runs and config overrides when resuming", () => {
    expect(codexExecutionFlags("workspace-write", false)).toEqual(["--sandbox", "workspace-write", "-c", 'approval_policy="never"']);
    expect(codexExecutionFlags("workspace-write", true)).toEqual(["-c", 'sandbox_mode="workspace-write"', "-c", 'approval_policy="never"']);
    expect(codexExecutionFlags("bypass", true)).toEqual(["--dangerously-bypass-approvals-and-sandbox"]);
  });

  it("reads the sandbox opt-in from the environment", () => {
    expect(codexSandboxModeFromEnv({ CLAUDI_CODEX_BYPASS_SANDBOX: "0" })).toBe("workspace-write");
    expect(codexSandboxModeFromEnv({})).toBe("bypass");
  });
});

describe("buildCodexArgs", () => {
  it("orders a fresh run's flags and terminates options before the prompt", () => {
    const args = buildCodexArgs({
      sandbox: "bypass",
      model: "gpt-6-astra",
      effort: "ultra",
      mcpOverrides: ["-c", "mcp=1"],
      upstreamArgs: ["-c", "up=1"],
      cwd: "/work",
      imagePaths: ["/t/a.png", "/t/b.png"],
      prompt: "--help is text",
    });
    expect(args).toEqual([
      "exec",
      "--json",
      "--dangerously-bypass-approvals-and-sandbox",
      "-m",
      "gpt-6-astra",
      "-c",
      'model_reasoning_effort="ultra"',
      "-c",
      "mcp=1",
      "-c",
      "up=1",
      "-C",
      "/work",
      "-i",
      "/t/a.png",
      "-i",
      "/t/b.png",
      "--",
      "--help is text",
    ]);
  });

  it("resumes with `exec resume <id>` and never passes -C or --sandbox", () => {
    const args = buildCodexArgs({ resumeSessionId: THREAD, sandbox: "workspace-write", cwd: "/work", prompt: "p" });
    expect(args.slice(0, 4)).toEqual(["exec", "resume", THREAD, "--json"]);
    expect(args).not.toContain("-C");
    expect(args).not.toContain("--sandbox");
    expect(args).toContain('sandbox_mode="workspace-write"');
  });
});

describe("resolveCodexModelChoice", () => {
  it("uses registry slugs and clamps effort per model", () => {
    expect(resolveCodexModelChoice("gpt-6-astra", "ultra", false)).toEqual({ model: "gpt-6-astra", effort: "ultra" });
    expect(resolveCodexModelChoice("gpt-5.6-luna", "ultra", false)).toEqual({ model: "gpt-5.6-luna", effort: "max" });
    expect(resolveCodexModelChoice("gpt-5.5", "max", false)).toEqual({ model: "gpt-5.5", effort: "xhigh" });
    expect(resolveCodexModelChoice("gpt54-high", undefined, false)).toEqual({ model: "gpt-6-astra", effort: "high" });
    expect(resolveCodexModelChoice("gpt-6-astra", undefined, false)).toEqual({ model: "gpt-6-astra", effort: null });
    expect(resolveCodexModelChoice("gpt-6-astra", "high", true)).toEqual({ model: "gpt-6-astra", effort: null });
  });

  it("validates discovered slugs against the CLI cache and passes unknown ones through", () => {
    expect(resolveCodexModelChoice("gpt-7-nova", "ultra", false, { efforts: ["low", "medium", "high"], defaultEffort: "medium" })).toEqual({
      model: "gpt-7-nova",
      effort: "high",
    });
    expect(resolveCodexModelChoice("gpt-7-nova", "high", false)).toEqual({ model: "gpt-7-nova", effort: "high" });
  });
});

describe("MCP overrides", () => {
  const servers = parseMcpServers({
    mcpServers: {
      "terminal-sessions": { command: "node", args: ["server.cjs", 4567], env: { ELECTRON_RUN_AS_NODE: 1, "A B": 'q"x' } },
      disabled: { command: "x", enabled: false, cwd: "/d" },
      broken: "nope",
    },
  });

  it("parses servers and detects the terminal server", () => {
    expect(servers.map(([name]) => name)).toEqual(["terminal-sessions", "disabled", "broken"]);
    expect(hasTerminalSessionsServer(servers)).toBe(true);
    expect(hasTerminalSessionsServer(servers.filter(([name]) => name !== "terminal-sessions"))).toBe(false);
    expect(parseMcpServers("garbage")).toEqual([]);
  });

  it("serializes env as a TOML inline table (PR #230)", () => {
    expect(tomlInlineTable({ ELECTRON_RUN_AS_NODE: "1", "A B": 'q"x' })).toBe('{"ELECTRON_RUN_AS_NODE" = "1", "A B" = "q\\"x"}');
    expect(buildCodexMcpOverrides(servers)).toEqual([
      "-c",
      'mcp_servers."terminal-sessions".command="node"',
      "-c",
      'mcp_servers."terminal-sessions".args=["server.cjs","4567"]',
      "-c",
      'mcp_servers."terminal-sessions".env={"ELECTRON_RUN_AS_NODE" = "1", "A B" = "q\\"x"}',
      "-c",
      'mcp_servers."terminal-sessions".enabled=true',
      "-c",
      'mcp_servers."disabled".command="x"',
      "-c",
      'mcp_servers."disabled".cwd="/d"',
      "-c",
      'mcp_servers."disabled".enabled=false',
    ]);
  });
});

describe("parseCodexLine", () => {
  it("accepts every current exec --json event and item type", () => {
    for (const line of Object.values(FIXTURE)) expect(parseCodexLine(line)?.kind).toBe("event");
  });

  it("drops unknown events / item types and flags non-JSON", () => {
    expect(parseCodexLine('{"type":"item.started","item":{"id":"i","type":"plan_update"}}')).toEqual({ kind: "ignored", type: "item.started/plan_update" });
    expect(parseCodexLine('{"type":"something.new"}')).toEqual({ kind: "ignored", type: "something.new" });
    expect(parseCodexLine("Reading additional input from stdin...")?.kind).toBe("invalid");
    expect(parseCodexLine("")).toBeNull();
  });
});

describe("inspectCodexEvent", () => {
  it("captures the thread id (current and legacy schema)", () => {
    expect(inspectCodexEvent(eventOf(FIXTURE.threadStarted)).threadId).toBe(THREAD);
    expect(inspectCodexEvent(eventOf(FIXTURE.sessionMeta)).threadId).toBe("legacy-1");
  });

  it("detects completion and fatal errors, but not warning items", () => {
    expect(inspectCodexEvent(eventOf(FIXTURE.turnCompleted)).turnCompleted).toBe(true);
    expect(inspectCodexEvent(eventOf(FIXTURE.taskComplete)).turnCompleted).toBe(true);
    expect(inspectCodexEvent(eventOf(FIXTURE.turnFailed)).errorMessage).toBe("stream disconnected");
    expect(inspectCodexEvent(eventOf(FIXTURE.topError)).errorMessage).toBe("model not supported");
    expect(inspectCodexEvent(eventOf(FIXTURE.warningItem))).toEqual({ threadId: null, turnCompleted: false, errorMessage: null });
  });

  it("keeps turn.completed usage including cached / reasoning tokens", () => {
    const event = eventOf(FIXTURE.turnCompleted);
    expect(event.type === "turn.completed" ? event.usage : null).toMatchObject({ cached_input_tokens: 11008, reasoning_output_tokens: 0 });
  });
});

describe("shouldEmitCodexStderr", () => {
  it("ignores stderr noise after a completed turn", () => {
    const base = { stderr: "Reading additional input from stdin...", exitCode: 0, signal: null, cancelled: false, sawTurnCompleted: true };
    expect(shouldEmitCodexStderr(base)).toBe(false);
    expect(shouldEmitCodexStderr({ ...base, sawTurnCompleted: false })).toBe(true);
    expect(shouldEmitCodexStderr({ ...base, exitCode: 1 })).toBe(true);
    expect(shouldEmitCodexStderr({ ...base, exitCode: 1, cancelled: true })).toBe(false);
  });
});

describe("buildCodexPrompt", () => {
  it("picks terminal instructions by environment", () => {
    expect(buildCodexPrompt("hi", [], { remote: false, hasTerminalSessions: true })).toContain("Prefer RayLine's terminal over one-off shell commands");
    expect(buildCodexPrompt("hi", [], { remote: false, hasTerminalSessions: false })).toContain("Do not describe it generically");
    const remote = buildCodexPrompt("hi", [{ type: "file", path: "/r/a" }], { remote: true, hasTerminalSessions: true, remoteChannelInstructions: "CH" });
    expect(remote).toContain("You are running on a remote SSH host");
    expect(remote).toContain("\n\nCH\n\nThe text below is the actual user prompt.");
    expect(remote.endsWith("--- USER PROMPT ---\n[Attached files uploaded to the remote SSH host:\n/r/a]\n\nhi")).toBe(true);
  });
});
