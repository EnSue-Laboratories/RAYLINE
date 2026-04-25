const path = require("path");
const fs = require("fs");
const os = require("os");
const { buildSpawnPath, isExecutable, resolveCliBin, spawnCli } = require("./cli-bin-resolver.cjs");

const activeAgents = new Map();
const TERMINAL_CLI_PATH = path.join(__dirname, "../scripts/claudi-terminal.cjs");

function log(...args) {
  console.log("[opencode-agent-manager]", ...args);
}

function isDirectory(dirPath) {
  try {
    return !!dirPath && fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

let cachedOpenCodeBin = null;

function resolveOpenCodeBin() {
  if (cachedOpenCodeBin && isExecutable(cachedOpenCodeBin)) return cachedOpenCodeBin;
  cachedOpenCodeBin = resolveCliBin("opencode", { envVarName: "OPENCODE_BIN" });
  return cachedOpenCodeBin;
}

function buildRayLinePrompt(prompt, files) {
  let fullPrompt = prompt;

  if (files && files.length > 0) {
    const filePaths = files.map((f) => f.path).filter(Boolean).join("\n");
    if (filePaths) fullPrompt = `[Attached files:\n${filePaths}]\n\n${fullPrompt}`;
  }

  return `System context for this run:
You are running inside RayLine, a desktop GUI client for coding agents.
The user is interacting via a chat interface, not a terminal.
Keep responses concise and conversational.
Use markdown formatting; the client renders headings, code blocks, tables, lists, and mermaid diagrams.
When showing diagrams, prefer mermaid code blocks.
Do not ask the user to run terminal commands when you can do the work yourself.
For math, use LaTeX: $inline$ and $$block$$. Never wrap LaTeX in code blocks.

Terminal sessions:
RayLine's terminal means the dedicated terminal window inside the app. Sessions created there are user-visible and remain available across turns.
Use RayLine's terminal when you want the user to see or interact with a shell, when a process should keep running, or when stdin needs to be sent over time.
If terminal-session MCP tools are not exposed, use the local terminal CLI exposed via $CLAUDI_TERMINAL_CLI.

The text below is the actual user prompt.
--- USER PROMPT ---
${fullPrompt}`;
}

function extractSessionId(event) {
  if (!event || typeof event !== "object") return null;
  return (
    event.sessionID ||
    event.session_id ||
    event.sessionId ||
    event.session?.id ||
    event.part?.sessionID ||
    null
  );
}

function extractErrorMessage(event) {
  if (!event || typeof event !== "object") return null;
  if (typeof event.message === "string" && event.message.trim()) return event.message.trim();
  if (typeof event.error === "string" && event.error.trim()) return event.error.trim();
  if (typeof event.error?.message === "string" && event.error.message.trim()) return event.error.message.trim();
  if (typeof event.error?.data?.message === "string" && event.error.data.message.trim()) {
    return event.error.data.message.trim();
  }
  return null;
}

function shouldEmitStderrError({ stderrBuffer, exitCode, signal, cancelled, sawJsonEvent }) {
  if (!stderrBuffer.trim()) return false;
  if (cancelled) return false;
  if (exitCode === 0 && !signal && sawJsonEvent) return false;
  return exitCode !== 0 || Boolean(signal) || !sawJsonEvent;
}

function startOpenCodeAgent({ conversationId, prompt, model, cwd, images, files, sessionId, resumeSessionId, forkSession }, webContents) {
  cancelOpenCodeAgent(conversationId);

  const openCodeBin = resolveOpenCodeBin();
  if (!openCodeBin) {
    const error = "Unable to locate the OpenCode CLI binary";
    log(error);
    webContents.send("agent-error", { conversationId, error });
    webContents.send("agent-done", { conversationId, exitCode: -1, provider: "opencode" });
    return null;
  }

  let launchCwd = process.cwd();
  if (cwd && isDirectory(cwd)) {
    launchCwd = cwd;
  } else if (cwd) {
    const error = `Invalid working directory: ${cwd}`;
    log(error);
    webContents.send("agent-error", { conversationId, error });
    webContents.send("agent-done", { conversationId, exitCode: -1, provider: "opencode" });
    return null;
  }

  const args = ["run", "--format", "json", "--dangerously-skip-permissions", "--dir", launchCwd];
  const nativeSessionId = resumeSessionId || sessionId;

  if (nativeSessionId) {
    args.push("--session", nativeSessionId);
    if (forkSession) args.push("--fork");
  }
  if (model) args.push("--model", model);

  const promptFiles = Array.isArray(files) ? [...files] : [];
  if (Array.isArray(images) && images.length > 0) {
    for (let i = 0; i < images.length; i += 1) {
      const dataUrl = images[i];
      const match = typeof dataUrl === "string"
        ? dataUrl.match(/^data:image\/([\w+.-]+);base64,(.+)$/)
        : null;
      if (!match) continue;
      const ext = match[1] === "jpeg" ? "jpg" : match[1];
      const tmpPath = path.join(os.tmpdir(), `rayline-opencode-img-${Date.now()}-${i}.${ext}`);
      fs.writeFileSync(tmpPath, Buffer.from(match[2], "base64"));
      promptFiles.push({ path: tmpPath });
    }
  }

  for (const file of promptFiles) {
    if (file?.path) args.push("--file", file.path);
  }

  const fullPrompt = buildRayLinePrompt(prompt, files);
  args.push("--", fullPrompt);

  log("Starting opencode agent:", { conversationId, model, cwd: launchCwd, sessionId: nativeSessionId || null });
  log("Full args:", args.filter((arg) => arg !== fullPrompt).join(" "));
  log("Prompt:", fullPrompt.slice(0, 100));

  const child = spawnCli(openCodeBin, args, {
    cwd: launchCwd,
    env: {
      ...process.env,
      FORCE_COLOR: "0",
      PATH: buildSpawnPath(),
      OPENCODE_CLIENT: "rayline",
      CLAUDI_TERMINAL_CLI: TERMINAL_CLI_PATH,
      CLAUDI_TERMINAL_PORT: global.terminalWsPort ? String(global.terminalWsPort) : "",
      CLAUDI_TERMINAL_MCP_CONFIG: global.mcpConfigPath || "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const state = {
    child,
    cancelled: false,
    sawJsonEvent: false,
    sessionId: nativeSessionId || null,
    lastErrorMessage: null,
  };

  activeAgents.set(conversationId, state);
  log("Spawned PID:", child.pid);

  let buffer = "";
  let stderrBuffer = "";

  const parseLine = (line) => {
    if (!line.trim()) return;
    try {
      const event = JSON.parse(line);
      state.sawJsonEvent = true;
      const nextSessionId = extractSessionId(event);
      if (nextSessionId) state.sessionId = nextSessionId;
      const error = event.type === "error" ? extractErrorMessage(event) : null;
      if (error) state.lastErrorMessage = error;
      log("Parsed event type:", event.type);
      webContents.send("agent-stream", { conversationId, event });
    } catch {
      webContents.send("agent-stream", {
        conversationId,
        event: { type: "opencode_stdout", text: `${line}\n` },
      });
    }
  };

  child.stdout.on("data", (chunk) => {
    if (activeAgents.get(conversationId) !== state) return;
    const raw = chunk.toString();
    log("stdout chunk:", raw.slice(0, 300));
    buffer += raw;
    const lines = buffer.split("\n");
    buffer = lines.pop();
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

    if (isCurrentState && buffer.trim()) {
      parseLine(buffer);
    }

    if (state.cancelled) {
      if (isCurrentState) {
        activeAgents.delete(conversationId);
        webContents.send("agent-done", {
          conversationId,
          exitCode,
          signal,
          provider: "opencode",
          threadId: state.sessionId,
        });
      }
      return;
    }

    if (!isCurrentState) return;

    if (state.lastErrorMessage || shouldEmitStderrError({
      stderrBuffer,
      exitCode,
      signal,
      cancelled: state.cancelled,
      sawJsonEvent: state.sawJsonEvent,
    })) {
      const error = state.lastErrorMessage || stderrBuffer.trim();
      if (error) webContents.send("agent-error", { conversationId, error });
    }

    activeAgents.delete(conversationId);
    webContents.send("agent-done", {
      conversationId,
      exitCode,
      signal,
      provider: "opencode",
      threadId: state.sessionId,
    });
  });

  child.on("error", (err) => {
    const isCurrentState = activeAgents.get(conversationId) === state;
    log("Spawn error:", err.message);
    if (isCurrentState) activeAgents.delete(conversationId);
    webContents.send("agent-error", { conversationId, error: err.message });
    if (isCurrentState) {
      webContents.send("agent-done", { conversationId, exitCode: -1, provider: "opencode" });
    }
  });

  return child;
}

function cancelOpenCodeAgent(conversationId) {
  const state = activeAgents.get(conversationId);
  if (state?.child) {
    log("Cancelling opencode agent:", conversationId);
    state.cancelled = true;
    state.child.kill("SIGTERM");
  }
}

function cancelAllOpenCode() {
  for (const [, state] of activeAgents) {
    state.cancelled = true;
    state.child.kill("SIGTERM");
  }
}

module.exports = { startOpenCodeAgent, cancelOpenCodeAgent, cancelAllOpenCode, resolveOpenCodeBin };
