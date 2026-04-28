const path = require("path");
const fs = require("fs");
const os = require("os");
const { buildSpawnPath, isExecutable, resolveCliBin, spawnCli } = require("./cli-bin-resolver.cjs");
const { findSessionCwd, moveSession } = require("./session-reader.cjs");
const { fetchClaudeUsage } = require("./claude-usage-fetcher.cjs");
const { createLogger } = require("./logger.cjs");

const activeAgents = new Map();
const log = createLogger("agent-manager");

function isDirectory(dirPath) {
  try {
    return !!dirPath && fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

function elapsedSince(startedAt) {
  return Date.now() - startedAt;
}

function markFirstTiming(state, key) {
  if (state[key] == null) state[key] = elapsedSince(state.startedAt);
}

function messageHasAssistantText(message) {
  return (message?.content || []).some((block) => block.type === "text" && typeof block.text === "string" && block.text.length > 0);
}

function summarizeResult(event) {
  if (!event) return null;
  return {
    subtype: event.subtype,
    is_error: event.is_error,
    stop_reason: event.stop_reason,
    terminal_reason: event.terminal_reason,
    session_id: event.session_id,
  };
}

function shouldEmitStderrError({ stderrBuffer, resultEvent, exitCode, signal, cancelled, stoppedForQuestion }) {
  if (!stderrBuffer.trim()) return false;
  if (cancelled || stoppedForQuestion) return false;
  if (resultEvent?.is_error || resultEvent?.subtype === "error_during_execution") return true;
  return !resultEvent && (exitCode !== 0 || Boolean(signal));
}

let cachedClaudeBin = null;

function resolveClaudeBin() {
  if (cachedClaudeBin && isExecutable(cachedClaudeBin)) return cachedClaudeBin;
  cachedClaudeBin = resolveCliBin("claude", { envVarName: "CLAUDE_BIN" });
  return cachedClaudeBin;
}

function resolveLaunchCwd({ cwd, sessionId }) {
  if (!cwd) return process.cwd();
  if (isDirectory(cwd)) return cwd;

  if (sessionId) {
    const recovered = findSessionCwd(sessionId);
    if (isDirectory(recovered)) {
      log("Recovered invalid cwd from session metadata", {
        requestedCwd: cwd,
        recoveredCwd: recovered,
        sessionId,
      });
      return recovered;
    }
  }

  throw new Error(`Invalid working directory: ${cwd}`);
}

function buildClaudeArgs({ model, sessionId, resumeSessionId, forkSession }) {
  const args = [
    "--print",
    "--input-format=stream-json",
    "--output-format=stream-json",
    "--verbose",
    "--include-partial-messages",
    "--permission-mode", "bypassPermissions",
    "--permission-prompt-tool", "stdio",
  ];

  args.push("--append-system-prompt", `You are running inside RayLine, a desktop GUI client for Claude Code.
The user is interacting via a chat interface, not a terminal.
Keep responses concise and conversational.
Use markdown formatting — the client renders headings, code blocks, tables, lists, and mermaid diagrams.
To show an image inline, output the raw Markdown image itself, not a code block or a description: ![alt text](https://example.com/image.png). RayLine supports http/https image URLs, data: URLs, file:// URLs, absolute local paths, and ~/ paths like ![a](~/Downloads/a.jpg).
When showing diagrams, prefer mermaid code blocks.
Do not ask the user to run terminal commands — you have full tool access.
For math, use LaTeX: $inline$ and $$block$$. Never wrap LaTeX in code blocks.

INTERACTIVE RENDER BLOCKS:
The client supports rendering live interactive HTML inline in the chat.
To use it, output a fenced code block with the language tag "render":

\`\`\`render
<canvas id="c" width="400" height="300"></canvas>
<script>
const ctx = document.getElementById('c').getContext('2d');
ctx.fillStyle = 'rgba(180,220,255,0.7)';
ctx.fillRect(50, 50, 100, 80);
</script>
\`\`\`

This renders as a LIVE interactive element inline, not as a code snippet.
You can load CDN libraries (D3, Plotly, Chart.js, Three.js) via script tags.
When the user asks to visualize, plot, chart, or graph something, prefer using a render block.

INTERACTIVE CONTROL BLOCKS:
The client also supports rendering structured interactive controls inline in the chat.
To use it, output a fenced code block with the language tag "control" whose contents are a JSON object.
Supported control type:
- "value_control": a slider-like control for one numeric value

Schema:
- type: "value_control"
- label: short UI label
- target: optional semantic id like "wallpaper.imgOpacity"
- mode: "continuous" or "discrete"
- min, max, step, value: for continuous controls
- options: for discrete controls, an array of { value, label }
- unit: optional suffix like "%"
- help: optional helper text
- actionLabel: optional button label
- messageTemplate: optional template for the follow-up user message; supports {{label}}, {{value}}, {{unit}}, {{target}}, {{optionLabel}}

Behavior:
- If target points to a supported app value, the control may apply directly while the user drags it.
- Directly bound controls do not need a send button.
- If no live target is available, the control can fall back to a send action using messageTemplate.

Example:
\`\`\`control
{
  "type": "value_control",
  "label": "Image opacity",
  "target": "wallpaper.imgOpacity",
  "mode": "continuous",
  "min": 0,
  "max": 100,
  "step": 1,
  "value": 70,
  "unit": "%",
  "help": "Drag to choose the exact wallpaper opacity.",
  "messageTemplate": "Set image opacity to {{value}}{{unit}}."
}
\`\`\`

When a control is not live-bound and the user presses its send button, RayLine will send a normal follow-up chat message containing the selected value.

THEME for render blocks and SVGs — dark palette:
- Background: #0a0a0a
- Text: rgba(255,255,255,0.75)
- Grid/lines: rgba(255,255,255,0.08)
- Data colors: rgba(180,220,255,0.7) blue, rgba(255,200,150,0.7) orange, rgba(180,255,200,0.7) green, rgba(255,180,180,0.7) red
- Avoid saturated blue/violet/default chart colors.

INTERACTIVE TERMINAL SESSIONS:
RayLine has a built-in terminal window. You have MCP tools to control it:
- create_session(name, command?, cwd?) — spawn a persistent shell session visible to the user
- send_input(name, text) — send keystrokes (use \\n for Enter, \\x03 for Ctrl+C)
- read_output(name, lines?) — read recent terminal output
- kill_session(name) — terminate a session
- list_sessions() — see all active sessions
Use these INSTEAD of the Bash tool when you need: long-running processes (dev servers, watchers), interactive prompts needing stdin, or persistent shells across turns.
The user can see and type into these terminals in real time.`);

  if (global.mcpConfigPath && fs.existsSync(global.mcpConfigPath)) {
    args.push("--mcp-config", global.mcpConfigPath);
  }

  if (model) args.push("--model", model);

  if (resumeSessionId) {
    args.push("--resume", resumeSessionId);
    if (forkSession) args.push("--fork-session");
  } else if (sessionId) {
    args.push("--session-id", sessionId);
  }

  return args;
}

function buildPermissionKey(toolName, input, blockedPath) {
  const key = blockedPath || input?.file_path || input?.path || input?.filePath || input?.command || "";
  return `${toolName || ""}::${key}`;
}

function classifyPermissionRequest(req) {
  const toolName = req?.tool_name || "";
  const input = req?.input || {};
  const blockedPath = req?.blocked_path || null;
  const targetPath = blockedPath || input.file_path || input.path || input.filePath || null;
  let summary = "";
  if (targetPath) summary = targetPath;
  else if (toolName === "Bash" && typeof input.command === "string") summary = input.command;
  else if (input.url) summary = input.url;
  return {
    toolName,
    targetPath,
    summary: summary || (toolName ? `${toolName} request` : "Tool request"),
    isSensitiveFile: Boolean(blockedPath),
  };
}

function buildPromptWithAttachments(prompt, images, files) {
  let fullPrompt = prompt;
  if (images && images.length > 0) {
    const imgPaths = [];
    for (let i = 0; i < images.length; i++) {
      const dataUrl = images[i];
      const match = dataUrl.match(/^data:image\/([\w+.-]+);base64,(.+)$/);
      if (match) {
        const ext = match[1] === "jpeg" ? "jpg" : match[1];
        const tmpPath = path.join(os.tmpdir(), `ensue-img-${Date.now()}-${i}.${ext}`);
        fs.writeFileSync(tmpPath, Buffer.from(match[2], "base64"));
        imgPaths.push(tmpPath);
      }
    }
    if (imgPaths.length > 0) {
      fullPrompt = `[Attached images: ${imgPaths.join(", ")}]\n\n${prompt}`;
    }
  }

  if (files && files.length > 0) {
    const filePaths = files.map((f) => f.path).join("\n");
    fullPrompt = `[Attached files:\n${filePaths}]\n\n${fullPrompt}`;
  }

  return fullPrompt;
}

function startAgent({ conversationId, prompt, model, cwd, images, files, sessionId, resumeSessionId, forkSession }, webContents) {
  cancelAgent(conversationId);

  const agentSessionId = resumeSessionId || sessionId;
  const claudeBin = resolveClaudeBin();
  if (!claudeBin) {
    const error = "Unable to locate the Claude CLI binary";
    log(error);
    webContents.send("agent-error", { conversationId, error });
    webContents.send("agent-done", { conversationId, exitCode: -1 });
    return null;
  }

  let launchCwd;
  try {
    launchCwd = resolveLaunchCwd({ cwd, sessionId: agentSessionId });
  } catch (err) {
    log("Invalid cwd:", { cwd, sessionId: agentSessionId, error: err.message });
    webContents.send("agent-error", { conversationId, error: err.message });
    webContents.send("agent-done", { conversationId, exitCode: -1 });
    return null;
  }

  const fullPrompt = buildPromptWithAttachments(prompt, images, files);

  const existing = activeAgents.get(conversationId);
  const sessionAllowlist = existing?.sessionAllowlist instanceof Set
    ? existing.sessionAllowlist
    : new Set();

  const state = {
    conversationId,
    webContents,
    claudeBin,
    model,
    launchCwd,
    startedAt: Date.now(),
    child: null,
    cancelled: false,
    waitingForQuestion: false,
    stoppedForQuestion: false,
    sawAskUserQuestion: false,
    runCount: 0,
    latestSessionId: agentSessionId || null,
    firstStdoutMs: null,
    firstEventMs: null,
    firstAssistantTextMs: null,
    firstToolUseMs: null,
    pendingPermissions: new Map(),
    sessionAllowlist,
    stdinClosed: false,
  };

  log("Starting agent:", { conversationId, model, cwd: launchCwd, sessionId, resumeSessionId, forkSession });
  const spawnRun = ({ runPrompt, runSessionId, runResumeSessionId, runForkSession }) => {
    state.runCount += 1;
    state.waitingForQuestion = false;
    state.stoppedForQuestion = false;

    const runNumber = state.runCount;
    const runStartedAt = Date.now();
    const args = buildClaudeArgs({
      model,
      sessionId: runSessionId,
      resumeSessionId: runResumeSessionId,
      forkSession: runForkSession,
    });

    if (runResumeSessionId && launchCwd) {
      try {
        const prepared = moveSession(runResumeSessionId, launchCwd);
        log("Prepared resume session for launch cwd", {
          conversationId,
          runNumber,
          resumeSessionId: runResumeSessionId,
          cwd: launchCwd,
          prepared,
        });
      } catch (err) {
        log("Failed to prepare resume session for launch cwd", {
          conversationId,
          runNumber,
          resumeSessionId: runResumeSessionId,
          cwd: launchCwd,
          error: err.message || err,
        });
      }
    }

    log("Run start:", {
      conversationId,
      runNumber,
      model,
      cwd: launchCwd,
      sessionId: runSessionId,
      resumeSessionId: runResumeSessionId,
      forkSession: runForkSession,
    });
    log("Full args:", args.join(" "));
    log("Prompt:", runPrompt.slice(0, 100));

    const child = spawnCli(claudeBin, args, {
      cwd: launchCwd,
      env: { ...process.env, FORCE_COLOR: "0", PATH: buildSpawnPath() },
      stdio: ["pipe", "pipe", "pipe"],
    });

    state.child = child;
    state.stdinClosed = false;
    activeAgents.set(conversationId, state);

    const writeStdinLine = (obj) => {
      if (!child.stdin || child.stdin.destroyed || state.stdinClosed) return false;
      try {
        child.stdin.write(JSON.stringify(obj) + "\n");
        return true;
      } catch (err) {
        log("stdin write failed:", err?.message || err);
        return false;
      }
    };

    const endStdin = () => {
      if (state.stdinClosed) return;
      state.stdinClosed = true;
      try { child.stdin?.end(); } catch {}
    };

    if (child.stdin) {
      child.stdin.on("error", (err) => {
        log("stdin error:", err?.message || err);
      });
    }

    writeStdinLine({
      type: "user",
      message: { role: "user", content: runPrompt },
    });

    state.writeStdinLine = writeStdinLine;
    state.endStdin = endStdin;

    log("Spawned PID:", child.pid, "run:", runNumber);

    let buffer = "";
    let stderrBuffer = "";
    let runResultEvent = null;

    const parseLine = (line) => {
      if (!line.trim() || state.cancelled || activeAgents.get(conversationId) !== state) return;

      try {
        const event = JSON.parse(line);
        const isThinking = event.type === "stream_event" && event.event?.delta?.type === "thinking_delta";

        markFirstTiming(state, "firstEventMs");
        if (!isThinking) log("Parsed event type:", event.type, "subtype:", event.subtype, "run:", runNumber);

        if (event.type === "control_request" && event.request?.subtype === "can_use_tool") {
          handleCanUseTool(state, event);
          return;
        }
        if (event.type === "control_cancel_request") {
          const reqId = event.request_id || event.cancel_request_id;
          if (reqId && state.pendingPermissions.has(reqId)) {
            state.pendingPermissions.delete(reqId);
            if (!webContents.isDestroyed?.()) {
              webContents.send("agent-permission-cancelled", { conversationId, requestId: reqId });
            }
          }
          return;
        }
        if (event.type === "control_response") {
          return;
        }

        if (event.type === "assistant" && messageHasAssistantText(event.message)) {
          markFirstTiming(state, "firstAssistantTextMs");
        }

        if (event.type === "stream_event") {
          const inner = event.event;
          if (
            inner?.type === "content_block_start" &&
            inner.content_block?.type === "tool_use"
          ) {
            markFirstTiming(state, "firstToolUseMs");
            if (inner.content_block?.name === "AskUserQuestion") {
              state.waitingForQuestion = true;
              state.sawAskUserQuestion = true;
            }
          } else if (
            inner?.type === "content_block_delta" &&
            inner.delta?.type === "text_delta" &&
            inner.delta?.text
          ) {
            markFirstTiming(state, "firstAssistantTextMs");
          }

          if (
            state.waitingForQuestion &&
            inner?.type === "content_block_stop"
          ) {
            log("AskUserQuestion fully streamed — killing process to wait for user answer");
            state.waitingForQuestion = false;
            state.stoppedForQuestion = true;
            child.kill("SIGTERM");
          }
        }

        if (event.type === "result") {
          runResultEvent = event;
          state.latestSessionId = event.session_id || state.latestSessionId;
          log("Result keys:", Object.keys(event));
          log("Result summary:", summarizeResult(event));
          // Close stdin so the CLI exits cleanly; no further turns in this run.
          endStdin();
        }

        webContents.send("agent-stream", { conversationId, event });

        // After the turn ends, fetch Claude Code 5h/7d plan quota and emit a
        // synthetic event so the loading status can show it. Cached aggressively
        // (180s TTL + 30s lock) so this is essentially free per-turn.
        if (event.type === "result") {
          fetchClaudeUsage()
            .then((rateLimits) => {
              if (!rateLimits) return;
              if (state.cancelled || activeAgents.get(conversationId) !== state) {
                // Conversation moved on — still emit so the now-frozen message updates.
              }
              if (webContents.isDestroyed?.()) return;
              webContents.send("agent-stream", {
                conversationId,
                event: { type: "rate_limits", rate_limits: rateLimits },
              });
            })
            .catch((err) => log("fetchClaudeUsage failed:", err?.message || err));
        }
      } catch (e) {
        log("Failed to parse JSON line:", line.slice(0, 200), "error:", e.message);
      }
    };

    child.stdout.on("data", (chunk) => {
      if (state.cancelled || activeAgents.get(conversationId) !== state) return;

      if (state.firstStdoutMs == null) {
        state.firstStdoutMs = elapsedSince(state.startedAt);
        log("First stdout received", {
          conversationId,
          runNumber,
          firstStdoutMs: state.firstStdoutMs,
        });
      }

      const raw = chunk.toString();
      log("stdout chunk:", raw.slice(0, 300));
      buffer += raw;
      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) parseLine(line);
    });

    child.stderr.on("data", (chunk) => {
      if (state.cancelled || activeAgents.get(conversationId) !== state) return;
      const text = chunk.toString();
      log("stderr:", text);
      stderrBuffer += text;
    });

    child.on("close", (exitCode, signal) => {
      if (activeAgents.get(conversationId) === state && buffer.trim()) {
        log("Flushing remaining buffer:", buffer.slice(0, 200));
        parseLine(buffer);
      }

      const isCurrentState = activeAgents.get(conversationId) === state;
      const resultSummary = summarizeResult(runResultEvent);

      log("Process closed", {
        conversationId,
        runNumber,
        exitCode,
        signal,
        durationMs: Date.now() - runStartedAt,
        result: resultSummary,
        timings: {
          firstStdoutMs: state.firstStdoutMs,
          firstEventMs: state.firstEventMs,
          firstAssistantTextMs: state.firstAssistantTextMs,
          firstToolUseMs: state.firstToolUseMs,
        },
      });

      if (state.cancelled) {
        if (isCurrentState) {
          activeAgents.delete(conversationId);
          webContents.send("agent-done", { conversationId, exitCode, signal });
        } else {
          log("Cancelled run closed after replacement; ignoring");
        }
        return;
      }

      if (!isCurrentState) {
        log("Stale run closed after replacement; ignoring");
        return;
      }

      if (shouldEmitStderrError({
        stderrBuffer,
        resultEvent: runResultEvent,
        exitCode,
        signal,
        cancelled: state.cancelled,
        stoppedForQuestion: state.stoppedForQuestion,
      })) {
        log("Full stderr:", stderrBuffer);
        webContents.send("agent-error", { conversationId, error: stderrBuffer.trim() });
      }

      activeAgents.delete(conversationId);
      webContents.send("agent-done", { conversationId, exitCode, signal });
    });

    child.on("error", (err) => {
      const isCurrentState = activeAgents.get(conversationId) === state;
      log("Spawn error:", err.message);
      if (isCurrentState) activeAgents.delete(conversationId);
      webContents.send("agent-error", { conversationId, error: err.message });
      if (isCurrentState) webContents.send("agent-done", { conversationId, exitCode: -1 });
    });

    return child;
  };

  return spawnRun({
    runPrompt: fullPrompt,
    runSessionId: sessionId,
    runResumeSessionId: resumeSessionId,
    runForkSession: forkSession,
  });
}

function writeControlResponse(state, requestId, responseBody) {
  if (!state || !state.writeStdinLine) return false;
  return state.writeStdinLine({
    type: "control_response",
    response: {
      subtype: "success",
      request_id: requestId,
      response: responseBody,
    },
  });
}

function handleCanUseTool(state, event) {
  const request = event.request || {};
  const requestId = event.request_id;
  if (!requestId) return;
  const classified = classifyPermissionRequest(request);
  const allowKey = buildPermissionKey(classified.toolName, request.input, request.blocked_path);

  if (state.sessionAllowlist.has(allowKey)) {
    log("Auto-allowing via session allowlist:", allowKey);
    writeControlResponse(state, requestId, {
      behavior: "allow",
      updatedInput: request.input || {},
    });
    return;
  }

  const payload = {
    conversationId: state.conversationId,
    requestId,
    toolUseId: request.tool_use_id || null,
    toolName: classified.toolName,
    input: request.input || {},
    blockedPath: request.blocked_path || null,
    description: request.description || null,
    permissionSuggestions: request.permission_suggestions || null,
    summary: classified.summary,
    targetPath: classified.targetPath,
    isSensitiveFile: classified.isSensitiveFile,
    allowKey,
  };

  state.pendingPermissions.set(requestId, { request, allowKey });
  if (!state.webContents.isDestroyed?.()) {
    state.webContents.send("agent-permission-request", payload);
  }
}

function respondPermission({ conversationId, requestId, behavior, message, updatedInput, scope }) {
  const state = activeAgents.get(conversationId);
  if (!state) {
    log("respondPermission: no active agent for", conversationId);
    return false;
  }
  const pending = state.pendingPermissions.get(requestId);
  if (!pending) {
    log("respondPermission: no pending request", requestId);
    return false;
  }
  state.pendingPermissions.delete(requestId);

  if (behavior === "allow") {
    if (scope === "session" && pending.allowKey) {
      state.sessionAllowlist.add(pending.allowKey);
      log("Added to session allowlist:", pending.allowKey);
    }
    return writeControlResponse(state, requestId, {
      behavior: "allow",
      updatedInput: updatedInput || pending.request.input || {},
    });
  }

  return writeControlResponse(state, requestId, {
    behavior: "deny",
    message: message || "User denied permission",
  });
}

function cancelAgent(conversationId) {
  const state = activeAgents.get(conversationId);
  if (state?.child) {
    log("Cancelling agent:", conversationId);
    state.cancelled = true;
    if (state.pendingPermissions?.size) {
      for (const requestId of state.pendingPermissions.keys()) {
        writeControlResponse(state, requestId, {
          behavior: "deny",
          message: "Cancelled",
        });
      }
      state.pendingPermissions.clear();
    }
    try { state.endStdin?.(); } catch {}
    state.child.kill("SIGTERM");
  }
}

function cancelAll() {
  for (const [, state] of activeAgents) {
    if (!state?.child) continue;
    state.cancelled = true;
    try { state.endStdin?.(); } catch {}
    state.child.kill("SIGTERM");
  }
}

function rewindFiles({ sessionId, messageUuid, cwd }) {
  return new Promise((resolve, reject) => {
    // --rewind-files is a standalone operation in --print mode: rewind files then exit
    const args = [
      "--print",
      "--resume", sessionId,
      "--rewind-files", messageUuid,
    ];

    log("Rewinding files:", { sessionId, messageUuid, cwd });

    const claudeBin = resolveClaudeBin();
    if (!claudeBin) {
      reject(new Error("Unable to locate the Claude CLI binary"));
      return;
    }

    let launchCwd;
    try {
      launchCwd = resolveLaunchCwd({ cwd, sessionId });
    } catch (err) {
      reject(err);
      return;
    }

    const child = spawnCli(claudeBin, args, {
      cwd: launchCwd,
      env: { ...process.env, FORCE_COLOR: "0", PATH: buildSpawnPath() },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

    child.on("close", (exitCode) => {
      log("Rewind finished, exitCode:", exitCode);
      if (stdout.trim()) log("Rewind stdout:", stdout.slice(0, 500));
      if (stderr.trim()) log("Rewind stderr:", stderr.slice(0, 500));
      if (exitCode === 0) {
        resolve({ success: true });
      } else {
        reject(new Error(stderr || `Rewind failed with exit code ${exitCode}`));
      }
    });

    child.on("error", (err) => {
      reject(err);
    });
  });
}

module.exports = { startAgent, cancelAgent, cancelAll, rewindFiles, respondPermission };
