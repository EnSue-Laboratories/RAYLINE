const path = require("path");
const fs = require("fs");
const { buildSpawnPath, isExecutable, resolveCliBin, spawnCli } = require("./cli-bin-resolver.cjs");
const { createLogger } = require("./logger.cjs");

const activeAgents = new Map();
const TERMINAL_CLI_PATH = require("./runtime-env.cjs").terminalCliPath();
const log = createLogger("grok-agent-manager");

let cachedGrokBin = null;

function isDirectory(dirPath) {
  try {
    return !!dirPath && fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

function resolveGrokBin() {
  if (cachedGrokBin && isExecutable(cachedGrokBin)) return cachedGrokBin;
  cachedGrokBin = resolveCliBin("grok", { envVarName: "GROK_BIN" });
  return cachedGrokBin;
}

function buildGrokEnv(extra = {}) {
  return {
    ...process.env,
    FORCE_COLOR: "0",
    NO_COLOR: "1",
    PATH: buildSpawnPath(),
    RAYLINE_CLIENT: "rayline",
    CLAUDI_TERMINAL_CLI: TERMINAL_CLI_PATH,
    CLAUDI_TERMINAL_PORT: global.terminalWsPort ? String(global.terminalWsPort) : "",
    CLAUDI_TERMINAL_MCP_CONFIG: global.mcpConfigPath || "",
    ...extra,
  };
}

function buildRayLinePrompt(prompt, files, projectContext) {
  let fullPrompt = prompt || "";

  if (files && files.length > 0) {
    const filePaths = files.map((f) => f.path).filter(Boolean).join("\n");
    if (filePaths) fullPrompt = `[Attached files:\n${filePaths}]\n\n${fullPrompt}`;
  }

  const trimmedProjectContext = typeof projectContext === "string" ? projectContext.trim() : "";
  const projectContextBlock = trimmedProjectContext
    ? `\n\nProject context configured in RayLine for this workspace:\n${trimmedProjectContext}`
    : "";

  return `System context for this run:
You are running inside RayLine, a desktop GUI client for coding agents.
The user is interacting via a chat interface, not a terminal.
Keep responses concise and conversational.
Use markdown formatting; the client renders headings, code blocks, tables, lists, and mermaid diagrams.
To show an image inline, output the raw Markdown image itself, not a code block or a description: ![alt text](https://example.com/image.png). RayLine supports http/https image URLs, data: URLs, file:// URLs, absolute local paths, and ~/ paths like ![a](~/Downloads/a.jpg).
When showing diagrams, prefer mermaid code blocks.
Do not ask the user to run terminal commands when you can do the work yourself.
For math, use LaTeX: $inline$ and $$block$$. Never wrap LaTeX in code blocks.

Terminal sessions:
RayLine's terminal means the dedicated terminal window inside the app. Sessions created there are user-visible and remain available across turns.
Use RayLine's terminal when you want the user to see or interact with a shell, when a process should keep running, or when stdin needs to be sent over time.
If terminal-session MCP tools are not exposed, use the local terminal CLI exposed via $CLAUDI_TERMINAL_CLI.${projectContextBlock}

The text below is the actual user prompt.
--- USER PROMPT ---
${fullPrompt}`;
}

function toToolName(event) {
  return event.toolName || event.tool_name || event.kind || event.title || "tool";
}

function toGrokUsageTokens(usage) {
  if (!usage || typeof usage !== "object") return null;
  return {
    input: usage.input_tokens ?? usage.inputTokens ?? 0,
    output: usage.output_tokens ?? usage.outputTokens ?? 0,
    total: usage.total_tokens ?? usage.totalTokens ?? null,
    reasoning: usage.reasoning_tokens ?? usage.reasoningTokens ?? 0,
    cache: {
      read: usage.cache_read_input_tokens ?? usage.cacheReadInputTokens ?? 0,
      write: usage.cache_creation_input_tokens ?? usage.cacheCreationInputTokens ?? 0,
    },
  };
}

function normalizeGrokEvent(event, state) {
  if (!event || typeof event !== "object") return [];
  const timestamp = Date.now();

  if (event.sessionId || event.session_id) {
    state.sessionId = event.sessionId || event.session_id;
  }

  if (event.type === "text") {
    const text = typeof event.data === "string" ? event.data : event.text || "";
    return text ? [{ type: "text", provider: "grok", text, timestamp }] : [];
  }

  if (event.type === "thought") {
    const text = typeof event.data === "string" ? event.data : event.text || "";
    return text ? [{ type: "reasoning", provider: "grok", reasoning: text, timestamp }] : [];
  }

  if (event.type === "tool_call") {
    const id = event.toolCallId || event.tool_call_id || event.id || `grok-tool-${state.toolSeq++}`;
    const name = toToolName(event);
    const input = event.rawInput || event.input || {};
    state.tools.set(id, { name, input });
    return [{
      type: "tool_use",
      provider: "grok",
      id,
      name,
      input,
      status: event.status || "in_progress",
      timestamp,
    }];
  }

  if (event.type === "tool_call_update") {
    const id = event.toolCallId || event.tool_call_id || event.id || `grok-tool-${state.toolSeq++}`;
    const previous = state.tools.get(id) || {};
    const name = toToolName(event) || previous.name || "tool";
    const input = event.rawInput || event.input || previous.input || {};
    if (!previous.name) state.tools.set(id, { name, input });
    return [{
      type: "tool_use",
      provider: "grok",
      id,
      name,
      input,
      output: event.rawOutput ?? event.output ?? event.content ?? null,
      status: event.status || "completed",
      timestamp,
    }];
  }

  if (event.type === "usage") {
    const tokens = toGrokUsageTokens(event.usage);
    return tokens ? [{
      type: "step_finish",
      provider: "grok",
      reason: event.stopReason || "usage",
      part: { id: event.messageId || `grok-usage-${state.usageSeq++}`, tokens, cost: event.total_cost_usd },
      timestamp,
    }] : [];
  }

  if (event.type === "end") {
    if (event.sessionId || event.session_id) state.sessionId = event.sessionId || event.session_id;
    const tokens = toGrokUsageTokens(event.usage);
    return [{
      type: "step_finish",
      provider: "grok",
      sessionId: state.sessionId || event.sessionId || event.session_id || null,
      reason: event.stopReason || "end_turn",
      ...(tokens ? { part: { id: event.requestId || `grok-end-${state.usageSeq++}`, tokens, cost: event.total_cost_usd } } : {}),
      timestamp,
    }];
  }

  if (event.type === "error") {
    return [{
      type: "error",
      provider: "grok",
      message: event.message || event.error || "Grok run failed.",
      error: event.message || event.error || "Grok run failed.",
      ...(state.sessionId ? { sessionId: state.sessionId } : {}),
      timestamp,
    }];
  }

  return [];
}

function shouldEmitStderrError({ stderrBuffer, exitCode, signal, cancelled, sawJsonEvent }) {
  if (!stderrBuffer.trim()) return false;
  if (cancelled) return false;
  if (exitCode === 0 && !signal && sawJsonEvent) return false;
  return exitCode !== 0 || Boolean(signal) || !sawJsonEvent;
}

function startGrokAgent({ conversationId, prompt, model, cwd, files, sessionId, resumeSessionId, forkSession, grokContinue, projectContext }, webContents) {
  cancelGrokAgent(conversationId);

  const grokBin = resolveGrokBin();
  if (!grokBin) {
    const error = "Unable to locate the Grok CLI binary";
    log(error);
    webContents.send("agent-error", { conversationId, error });
    webContents.send("agent-done", { conversationId, exitCode: -1, provider: "grok" });
    return null;
  }

  let launchCwd = process.cwd();
  if (cwd && isDirectory(cwd)) {
    launchCwd = cwd;
  } else if (cwd) {
    const error = `Invalid working directory: ${cwd}`;
    log(error);
    webContents.send("agent-error", { conversationId, error });
    webContents.send("agent-done", { conversationId, exitCode: -1, provider: "grok" });
    return null;
  }

  const nativeSessionId = resumeSessionId || sessionId;
  const fullPrompt = buildRayLinePrompt(prompt, files, projectContext);
  const args = ["--cwd", launchCwd, "--output-format", "streaming-json", "--always-approve"];

  if (model) args.push("--model", model);
  if (nativeSessionId) {
    args.push("--resume", nativeSessionId);
    if (forkSession) args.push("--fork-session");
  } else if (grokContinue) {
    args.push("--continue");
  }
  args.push("--single", fullPrompt);

  log("Starting grok agent:", { conversationId, model, cwd: launchCwd, sessionId: nativeSessionId || null, continuePrevious: Boolean(!nativeSessionId && grokContinue) });

  const child = spawnCli(grokBin, args, {
    cwd: launchCwd,
    env: buildGrokEnv(),
    stdio: ["ignore", "pipe", "pipe"],
  });

  const state = {
    child,
    cancelled: false,
    sawJsonEvent: false,
    sessionId: nativeSessionId || null,
    lastErrorMessage: null,
    emittedStreamError: false,
    tools: new Map(),
    toolSeq: 1,
    usageSeq: 1,
  };

  activeAgents.set(conversationId, state);
  log("Spawned PID:", child.pid);

  let stdoutBuffer = "";
  let stderrBuffer = "";

  const parseLine = (line) => {
    if (!line.trim()) return;
    try {
      const event = JSON.parse(line);
      state.sawJsonEvent = true;
      const normalizedEvents = normalizeGrokEvent(event, state);
      for (const normalized of normalizedEvents) {
        const nextSessionId = normalized.sessionId || normalized.session_id || normalized.part?.sessionID;
        if (nextSessionId) state.sessionId = nextSessionId;
        if (normalized.type === "error") {
          state.lastErrorMessage = normalized.message || normalized.error || null;
          state.emittedStreamError = true;
        }
        webContents.send("agent-stream", { conversationId, event: normalized });
      }
    } catch {
      webContents.send("agent-stream", {
        conversationId,
        event: { type: "text", provider: "grok", text: `${line}\n`, timestamp: Date.now() },
      });
    }
  };

  child.stdout.on("data", (chunk) => {
    if (activeAgents.get(conversationId) !== state) return;
    stdoutBuffer += chunk.toString();
    const lines = stdoutBuffer.split("\n");
    stdoutBuffer = lines.pop() || "";
    for (const line of lines) parseLine(line);
  });

  child.stderr.on("data", (chunk) => {
    if (activeAgents.get(conversationId) !== state && !state.cancelled) return;
    const text = chunk.toString();
    log("stderr:", text);
    stderrBuffer += text;
  });

  child.on("close", (exitCode, signal) => {
    const isCurrentState = activeAgents.get(conversationId) === state;
    log("Process closed", { conversationId, exitCode, signal, cancelled: state.cancelled, current: isCurrentState });
    if (isCurrentState && stdoutBuffer.trim()) parseLine(stdoutBuffer);

    if (!isCurrentState) return;
    activeAgents.delete(conversationId);

    const shouldEmitTerminalError = !state.emittedStreamError && (
      state.lastErrorMessage ||
      shouldEmitStderrError({
        stderrBuffer,
        exitCode,
        signal,
        cancelled: state.cancelled,
        sawJsonEvent: state.sawJsonEvent,
      })
    );
    if (!state.cancelled && shouldEmitTerminalError) {
      const error = state.lastErrorMessage || stderrBuffer.trim();
      if (error) webContents.send("agent-error", { conversationId, error });
    }

    webContents.send("agent-done", {
      conversationId,
      exitCode,
      signal,
      provider: "grok",
      threadId: state.sessionId,
    });
  });

  child.on("error", (err) => {
    const isCurrentState = activeAgents.get(conversationId) === state;
    log("Spawn error:", err.message);
    if (isCurrentState) activeAgents.delete(conversationId);
    webContents.send("agent-error", { conversationId, error: err.message });
    if (isCurrentState) {
      webContents.send("agent-done", { conversationId, exitCode: -1, provider: "grok" });
    }
  });

  return child;
}

function cancelGrokAgent(conversationId) {
  const state = activeAgents.get(conversationId);
  if (!state || state.cancelled) return;
  log("Cancelling grok agent:", conversationId);
  state.cancelled = true;
  if (state.child) state.child.kill("SIGTERM");
}

function cancelAllGrok() {
  for (const [, state] of activeAgents) {
    state.cancelled = true;
    if (state.child) state.child.kill("SIGTERM");
  }
  activeAgents.clear();
}

module.exports = {
  buildRayLinePrompt,
  normalizeGrokEvent,
  startGrokAgent,
  cancelGrokAgent,
  cancelAllGrok,
  resolveGrokBin,
};
