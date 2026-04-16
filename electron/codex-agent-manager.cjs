const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

const activeAgents = new Map();
const EXTRA_PATH_DIRS = [
  "/opt/homebrew/bin",
  "/usr/local/bin",
  "/usr/bin",
  "/bin",
];
const TERMINAL_CLI_PATH = path.join(__dirname, "../scripts/claudi-terminal.cjs");

function log(...args) {
  console.log("[codex-agent-manager]", ...args);
}

function isExecutable(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function isDirectory(dirPath) {
  try {
    return !!dirPath && fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

function buildSpawnPath() {
  const pathParts = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
  return [...new Set([...pathParts, ...EXTRA_PATH_DIRS])].join(path.delimiter);
}

function shouldEmitStderrError({ stderrBuffer, exitCode, signal, cancelled, sawTurnCompleted }) {
  if (!stderrBuffer.trim()) return false;
  if (cancelled) return false;
  if (sawTurnCompleted && exitCode === 0 && !signal) return false;
  return exitCode !== 0 || Boolean(signal) || !sawTurnCompleted;
}

let cachedCodexBin = null;

function resolveCodexBin() {
  if (cachedCodexBin && isExecutable(cachedCodexBin)) return cachedCodexBin;

  const searchPath = buildSpawnPath();
  const candidates = [process.env.CODEX_BIN, "codex"].filter(Boolean);

  for (const candidate of candidates) {
    if (path.isAbsolute(candidate) && isExecutable(candidate)) {
      cachedCodexBin = candidate;
      return candidate;
    }
    for (const dir of searchPath.split(path.delimiter).filter(Boolean)) {
      const fullPath = path.join(dir, candidate);
      if (isExecutable(fullPath)) {
        cachedCodexBin = fullPath;
        return fullPath;
      }
    }
  }

  return null;
}

function getExecutionFlags() {
  // Claudi is expected to run Codex without internal CLI sandboxing so it can
  // use the full local environment. Set CLAUDI_CODEX_BYPASS_SANDBOX=0 to fall
  // back to Codex's workspace-write sandboxed mode.
  if (process.env.CLAUDI_CODEX_BYPASS_SANDBOX === "0") {
    return ["--full-auto"];
  }
  return ["--dangerously-bypass-approvals-and-sandbox"];
}

function readConfiguredMcpServers() {
  const configPath = global.mcpConfigPath;
  if (!configPath) {
    log("No MCP config path available for Codex");
    return [];
  }
  if (!fs.existsSync(configPath)) {
    log("Codex MCP config path does not exist:", configPath);
    return [];
  }

  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    return Object.entries(parsed?.mcpServers || {});
  } catch (error) {
    log("Failed to load MCP config overrides:", error.message);
    return [];
  }
}

function buildClaudiPrompt(prompt, files, mcpServers) {
  let fullPrompt = prompt;

  if (files && files.length > 0) {
    const filePaths = files.map((f) => f.path).join("\n");
    fullPrompt = `[Attached files:\n${filePaths}]\n\n${fullPrompt}`;
  }

  const hasTerminalSessions = (mcpServers || []).some(
    ([name, config]) => name === "terminal-sessions" && config?.command && config?.enabled !== false
  );

  const terminalInstructions = hasTerminalSessions
    ? `Terminal sessions:
Claudi's terminal means the visible sidebar terminal drawer inside the app. Sessions created there are user-visible and remain available across turns.
Use Claudi's terminal when you want the user to see or interact with a shell, when a process should keep running, or when stdin needs to be sent over time.
Prefer Claudi's terminal over one-off shell commands for dev servers, watchers, REPLs, or any command the user may want to monitor.
If MCP terminal tools are unavailable, use the local terminal CLI exposed via $CLAUDI_TERMINAL_CLI.
CLI examples:
- node "$CLAUDI_TERMINAL_CLI" list
- node "$CLAUDI_TERMINAL_CLI" create <name> --cwd <path>
- node "$CLAUDI_TERMINAL_CLI" send <name> "npm run dev\\n"
- node "$CLAUDI_TERMINAL_CLI" read <name> --lines 80
- node "$CLAUDI_TERMINAL_CLI" kill <name>`
    : `Terminal sessions:
Claudi's terminal means the visible sidebar terminal drawer inside the app. Do not describe it generically; use it when you want a user-visible, long-lived shell inside Claudi itself.
If terminal-session MCP tools are not exposed, use the local terminal CLI exposed via $CLAUDI_TERMINAL_CLI to control Claudi's sidebar terminal directly.
CLI examples:
- node "$CLAUDI_TERMINAL_CLI" list
- node "$CLAUDI_TERMINAL_CLI" create <name> --cwd <path>
- node "$CLAUDI_TERMINAL_CLI" send <name> "npm run dev\\n"
- node "$CLAUDI_TERMINAL_CLI" read <name> --lines 80
- node "$CLAUDI_TERMINAL_CLI" kill <name>`;

  const claudiInstructions = `System context for this run:
You are running inside Claudi, a desktop GUI client for coding agents.
The user is interacting via a chat interface, not a terminal.
Keep responses concise and conversational.
Use markdown formatting; the client renders headings, code blocks, tables, lists, and mermaid diagrams.
When showing diagrams, prefer mermaid code blocks.
Do not ask the user to run terminal commands when you can do the work yourself.
For math, use LaTeX: $inline$ and $$block$$. Never wrap LaTeX in code blocks.

Interactive render blocks:
Output fenced code blocks with language tag "render" to display live HTML inline in the chat.

${terminalInstructions}

The text below is the actual user prompt.
--- USER PROMPT ---
${fullPrompt}`;

  return claudiInstructions;
}

function appendCodexMcpOverrides(args, mcpServers) {
  const names = (mcpServers || []).map(([name]) => name);
  if (names.length === 0) return;

  log("Applying Codex MCP servers:", names);

  for (const [name, config] of mcpServers) {
    if (!config?.command) continue;

    const commandOverride = `mcp_servers."${name}".command=${JSON.stringify(config.command)}`;
    args.push("-c", commandOverride);
    log("Codex MCP override:", commandOverride);

    if (Array.isArray(config.args)) {
      const argsOverride = `mcp_servers."${name}".args=${JSON.stringify(config.args)}`;
      args.push("-c", argsOverride);
      log("Codex MCP override:", argsOverride);
    }

    if (config.env && typeof config.env === "object") {
      const envOverride = `mcp_servers."${name}".env=${JSON.stringify(config.env)}`;
      args.push("-c", envOverride);
      log("Codex MCP override:", envOverride);
    }

    if (typeof config.cwd === "string" && config.cwd) {
      const cwdOverride = `mcp_servers."${name}".cwd=${JSON.stringify(config.cwd)}`;
      args.push("-c", cwdOverride);
      log("Codex MCP override:", cwdOverride);
    }

    const enabledOverride = `mcp_servers."${name}".enabled=${config.enabled !== false}`;
    args.push("-c", enabledOverride);
    log("Codex MCP override:", enabledOverride);
  }
}

function startCodexAgent({ conversationId, prompt, model, effort, cwd, images, files, sessionId, resumeSessionId }, webContents) {
  cancelCodexAgent(conversationId);

  const args = ["exec"];

  // Resume an existing thread if requested
  if (resumeSessionId) {
    args.push("resume", resumeSessionId);
  }

  args.push("--json", ...getExecutionFlags());

  if (model) {
    args.push("-m", model);
  }

  if (effort) {
    args.push("-c", `model_reasoning_effort="${effort}"`);
  }

  const mcpServers = readConfiguredMcpServers();
  appendCodexMcpOverrides(args, mcpServers);

  // Working directory — only pass -C for new sessions (resume doesn't accept it)
  let launchCwd = process.cwd();
  if (cwd && isDirectory(cwd)) {
    launchCwd = cwd;
    if (!resumeSessionId) {
      args.push("-C", cwd);
    }
  } else if (cwd) {
    const error = `Invalid working directory: ${cwd}`;
    log(error);
    webContents.send("agent-error", { conversationId, error });
    webContents.send("agent-done", { conversationId, exitCode: -1 });
    return null;
  }

  // Handle images — decode base64 data URLs to temp files, pass via -i
  if (images && images.length > 0) {
    for (let i = 0; i < images.length; i++) {
      const dataUrl = images[i];
      const match = dataUrl.match(/^data:image\/([\w+.-]+);base64,(.+)$/);
      if (match) {
        const ext = match[1] === "jpeg" ? "jpg" : match[1];
        const tmpPath = path.join(os.tmpdir(), `ensue-codex-img-${Date.now()}-${i}.${ext}`);
        fs.writeFileSync(tmpPath, Buffer.from(match[2], "base64"));
        args.push("-i", tmpPath);
      }
    }
  }

  // Prompt goes last as positional arg
  const fullPrompt = buildClaudiPrompt(prompt, files, mcpServers);
  args.push(fullPrompt);

  const codexBin = resolveCodexBin();
  if (!codexBin) {
    const error = "Unable to locate the Codex CLI binary";
    log(error);
    webContents.send("agent-error", { conversationId, error });
    webContents.send("agent-done", { conversationId, exitCode: -1 });
    return null;
  }

  log("Starting codex agent:", { conversationId, model, effort, cwd: launchCwd, resumeSessionId });
  log("Full args:", args.filter(a => a !== fullPrompt).join(" "));
  log("Prompt:", fullPrompt.slice(0, 100));

  const child = spawn(codexBin, args, {
    cwd: launchCwd,
    env: {
      ...process.env,
      FORCE_COLOR: "0",
      PATH: buildSpawnPath(),
      CLAUDI_TERMINAL_CLI: TERMINAL_CLI_PATH,
      CLAUDI_TERMINAL_PORT: global.terminalWsPort ? String(global.terminalWsPort) : "",
      CLAUDI_TERMINAL_MCP_CONFIG: global.mcpConfigPath || "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  log("Spawned PID:", child.pid);

  const state = {
    child,
    cancelled: false,
    sawTurnCompleted: false,
  };

  activeAgents.set(conversationId, state);

  let buffer = "";
  let stderrBuffer = "";

  const parseLine = (line) => {
    if (!line.trim()) return;
    try {
      const event = JSON.parse(line);
      if (event.type === "turn.completed") {
        state.sawTurnCompleted = true;
      }
      log("Parsed event type:", event.type);
      webContents.send("agent-stream", { conversationId, event });
    } catch (e) {
      log("Failed to parse JSON line:", line.slice(0, 200), "error:", e.message);
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

    log("Process closed, exitCode:", exitCode, "signal:", signal, "cancelled:", state.cancelled, "current:", isCurrentState);

    if (isCurrentState && buffer.trim()) {
      log("Flushing remaining buffer:", buffer.slice(0, 200));
      parseLine(buffer);
    }

    if (state.cancelled) {
      if (isCurrentState) {
        activeAgents.delete(conversationId);
        webContents.send("agent-done", { conversationId, exitCode, signal });
      }
      return;
    }

    if (!isCurrentState) {
      log("Stale codex run closed after replacement; ignoring");
      return;
    }

    if (shouldEmitStderrError({
      stderrBuffer,
      exitCode,
      signal,
      cancelled: state.cancelled,
      sawTurnCompleted: state.sawTurnCompleted,
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
    if (isCurrentState) {
      webContents.send("agent-done", { conversationId, exitCode: -1 });
    }
  });

  return child;
}

function cancelCodexAgent(conversationId) {
  const state = activeAgents.get(conversationId);
  if (state?.child) {
    log("Cancelling codex agent:", conversationId);
    state.cancelled = true;
    state.child.kill("SIGTERM");
  }
}

function cancelAllCodex() {
  for (const [, state] of activeAgents) {
    state.cancelled = true;
    state.child.kill("SIGTERM");
  }
}

module.exports = { startCodexAgent, cancelCodexAgent, cancelAllCodex, resolveCodexBin };
