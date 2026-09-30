const fs = require("node:fs");
const { StringDecoder } = require("node:string_decoder");
const { resolveCliBin, spawnCli, buildSpawnPath } = require("./cli-bin-resolver.cjs");
const { withSystemProxy, terminalCliPath } = require("./runtime-env.cjs");
const { buildRayLinePrompt } = require("./grok-agent-manager.cjs");
const activeAgents = new Map();

function resolveAgyBin() { return resolveCliBin("agy", { envVarName: "AGY_BIN" }); }
function createAgyStreamState() { return { sessionId: null, text: "", usage: new Map(), tools: new Map(), resultSeen: false, failed: false }; }
function normalizeAgyEvent(event, state) {
  if (!event || typeof event !== "object") return [];
  const step = event.step_update;
  const result = event.result;
  state.sessionId = event.conversation_id || step?.conversation_id || result?.conversation_id || state.sessionId;
  const base = { provider: "agy", sessionId: state.sessionId, timestamp: Date.now() };
  if (event.event === "init") return [{ ...base, type: "step_start" }];
  if (event.event === "step_update" && step) {
    const out = [];
    if (step.usage) state.usage.set(step.step_index, step.usage);
    if (typeof step.text_delta === "string" && step.step_type === "agent_response") {
      state.text += step.text_delta;
      out.push({ ...base, type: "text", text: step.text_delta });
    }
    if (typeof step.thinking_delta === "string") out.push({ ...base, type: "reasoning", reasoning: step.thinking_delta });
    if (step.step_type === "tool") {
      const id = `agy-tool-${step.step_index}`;
      const previous = state.tools.get(id) || {};
      const info = step.tool_info || {};
      const name = info.name || step.tool_name || previous.name || "tool";
      const input = info.parameters || previous.input || {};
      state.tools.set(id, { name, input });
      out.push({ ...base, type: "tool_use", id, name, input, output: info.output ?? null, status: step.state === "DONE" ? "completed" : "in_progress" });
    }
    return out;
  }
  if (event.event === "result" && result) {
    state.resultSeen = true;
    const out = [];
    if (result.status !== "SUCCESS") {
      state.failed = true;
      out.push({ ...base, type: "error", message: typeof result.error === "string" ? result.error : result.error?.message || result.response || `AGY ended with status ${result.status || "unknown"}.` });
    } else if (!state.text && typeof result.response === "string") {
      state.text = result.response;
      out.push({ ...base, type: "text", text: result.response });
    }
    // Result totals include earlier turns on resume; use only this run's steps.
    const usage = [...state.usage.values()];
    const last = usage.at(-1);
    const tokens = last ? {
      input: last.input_tokens || 0,
      output: usage.reduce((sum, item) => sum + (item.output_tokens || 0), 0),
      reasoning: usage.reduce((sum, item) => sum + (item.thinking_tokens || 0), 0),
      cache: { read: last.cache_read_tokens || 0, write: 0 },
    } : null;
    out.push({ ...base, type: "step_finish", reason: state.failed ? "error" : "end_turn", ...(tokens ? { part: { tokens } } : {}) });
    return out;
  }
  if (event.event === "error") {
    state.failed = true;
    return [{ ...base, type: "error", message: typeof event.error === "string" ? event.error : event.error?.message || event.message || "AGY run failed." }];
  }
  return [];
}

function buildAgyArgs({ prompt, model, sessionId, resumeSessionId, forkSession, files, images, projectContext }) {
  if (forkSession) throw new Error("AGY does not support branching a native conversation. Start a new chat to create a separate run.");
  if (images?.length) throw new Error("AGY image attachments are not supported yet. Attach the image as a local file instead.");
  const args = ["--print", buildRayLinePrompt(prompt, files, projectContext), "--output-format", "stream-json"];
  if (model) args.push("--model", model);
  const nativeId = resumeSessionId || sessionId;
  if (nativeId) args.push("--conversation", nativeId);
  // Preserve the user's native AGY permission policy; do not auto-approve tools.
  return args;
}

function startAgyAgent(opts, webContents) {
  cancelAgyAgent(opts.conversationId);
  const bin = resolveAgyBin();
  if (!bin) throw new Error("Unable to locate Antigravity CLI (agy).");
  const cwd = opts.cwd || process.cwd();
  if (!fs.statSync(cwd).isDirectory()) throw new Error(`Invalid working directory: ${cwd}`);
  const args = buildAgyArgs(opts);
  const child = spawnCli(bin, args, { cwd, env: withSystemProxy({
    ...process.env, PATH: buildSpawnPath(), NO_COLOR: "1", FORCE_COLOR: "0",
    CLAUDI_TERMINAL_CLI: terminalCliPath(),
    CLAUDI_TERMINAL_PORT: global.terminalWsPort ? String(global.terminalWsPort) : "",
    CLAUDI_TERMINAL_MCP_CONFIG: global.mcpConfigPath || "",
  }), stdio: ["ignore", "pipe", "pipe"] });
  const state = { ...createAgyStreamState(), child, cancelled: false, settled: false, sawEvent: false };
  activeAgents.set(opts.conversationId, state);
  const send = (channel, payload) => {
    if (!webContents.isDestroyed?.()) webContents.send(channel, { conversationId: opts.conversationId, ...payload });
  };
  const decoder = new StringDecoder("utf8");
  let buffer = "";
  let stderr = "";
  const parse = (line) => {
    if (!line.trim() || activeAgents.get(opts.conversationId) !== state) return;
    try {
      const event = JSON.parse(line);
      if (event.event) { state.sawEvent = true; clearTimeout(startupTimer); }
      for (const normalized of normalizeAgyEvent(event, state)) send("agent-stream", { event: normalized });
    } catch { /* Human diagnostics are reported from stderr on failure. */ }
  };
  const startupTimer = setTimeout(() => {
    if (!state.sawEvent && !state.cancelled) {
      state.failed = true;
      send("agent-error", { error: "AGY startup timed out. Check its login and network connection in the terminal." });
      child.kill("SIGTERM");
    }
  }, 45_000);
  startupTimer.unref?.();
  child.stdout.on("data", (chunk) => {
    buffer += decoder.write(chunk);
    const lines = buffer.split("\n"); buffer = lines.pop() || "";
    for (const line of lines) parse(line);
  });
  child.stderr.on("data", (chunk) => { stderr = (stderr + chunk.toString()).slice(-16_000); });
  child.on("error", (error) => {
    clearTimeout(startupTimer);
    if (state.settled || activeAgents.get(opts.conversationId) !== state) return;
    state.settled = true; activeAgents.delete(opts.conversationId);
    send("agent-error", { error: error.message });
    send("agent-done", { provider: "agy", exitCode: -1 });
  });
  child.on("close", (exitCode, signal) => {
    clearTimeout(startupTimer); clearTimeout(state.killTimer);
    if (state.settled || activeAgents.get(opts.conversationId) !== state) return;
    buffer += decoder.end(); if (buffer.trim()) parse(buffer);
    state.settled = true; activeAgents.delete(opts.conversationId);
    if (!state.cancelled && !state.failed && (exitCode !== 0 || !state.resultSeen)) {
      state.failed = true;
      send("agent-error", { error: stderr.trim() || "AGY exited without a completed response." });
    }
    send("agent-done", { provider: "agy", exitCode: state.failed ? (exitCode || 1) : exitCode, signal, threadId: state.sessionId });
  });
  return child;
}
function cancelAgyAgent(id) {
  const state = activeAgents.get(id);
  if (!state || state.cancelled) return;
  state.cancelled = true; state.child.kill("SIGTERM");
  state.killTimer = setTimeout(() => { if (state.child.exitCode == null && state.child.signalCode == null) state.child.kill("SIGKILL"); }, 3000);
  state.killTimer.unref?.();
}
function cancelAllAgy() { for (const id of activeAgents.keys()) cancelAgyAgent(id); }
module.exports = { startAgyAgent, cancelAgyAgent, cancelAllAgy, resolveAgyBin, normalizeAgyEvent, createAgyStreamState, buildAgyArgs };
