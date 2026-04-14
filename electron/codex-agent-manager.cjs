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

function startCodexAgent({ conversationId, prompt, model, effort, cwd, images, sessionId, resumeSessionId }, webContents) {
  cancelCodexAgent(conversationId);

  const args = ["exec"];

  // Resume an existing thread if requested
  if (resumeSessionId) {
    args.push("resume", resumeSessionId);
  }

  args.push("--json", "--full-auto");

  if (model) {
    args.push("-m", model);
  }

  if (effort) {
    args.push("-c", `model_reasoning_effort="${effort}"`);
  }

  // Working directory
  let launchCwd = process.cwd();
  if (cwd && isDirectory(cwd)) {
    launchCwd = cwd;
    args.push("-C", cwd);
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
  args.push(prompt);

  const codexBin = resolveCodexBin();
  if (!codexBin) {
    const error = "Unable to locate the Codex CLI binary";
    log(error);
    webContents.send("agent-error", { conversationId, error });
    webContents.send("agent-done", { conversationId, exitCode: -1 });
    return null;
  }

  log("Starting codex agent:", { conversationId, model, effort, cwd: launchCwd, resumeSessionId });
  log("Full args:", args.filter(a => a !== prompt).join(" "));
  log("Prompt:", prompt.slice(0, 100));

  const child = spawn(codexBin, args, {
    cwd: launchCwd,
    env: { ...process.env, FORCE_COLOR: "0", PATH: buildSpawnPath() },
    stdio: ["ignore", "pipe", "pipe"],
  });

  log("Spawned PID:", child.pid);

  activeAgents.set(conversationId, child);

  let buffer = "";
  let stderrBuffer = "";

  child.stdout.on("data", (chunk) => {
    const raw = chunk.toString();
    log("stdout chunk:", raw.slice(0, 300));
    buffer += raw;
    const lines = buffer.split("\n");
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        log("Parsed event type:", event.type);
        webContents.send("agent-stream", { conversationId, event });
      } catch (e) {
        log("Failed to parse JSON line:", line.slice(0, 200), "error:", e.message);
      }
    }
  });

  child.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    log("stderr:", text);
    stderrBuffer += text;
  });

  child.on("close", (exitCode) => {
    log("Process closed, exitCode:", exitCode);
    if (stderrBuffer.trim()) {
      log("Full stderr:", stderrBuffer);
      webContents.send("agent-error", { conversationId, error: stderrBuffer.trim() });
    }
    // Flush remaining buffer
    if (buffer.trim()) {
      log("Flushing remaining buffer:", buffer.slice(0, 200));
      try {
        const event = JSON.parse(buffer);
        webContents.send("agent-stream", { conversationId, event });
      } catch {}
    }
    activeAgents.delete(conversationId);
    webContents.send("agent-done", { conversationId, exitCode });
  });

  child.on("error", (err) => {
    log("Spawn error:", err.message);
    activeAgents.delete(conversationId);
    webContents.send("agent-error", { conversationId, error: err.message });
  });

  return child;
}

function cancelCodexAgent(conversationId) {
  const child = activeAgents.get(conversationId);
  if (child) {
    log("Cancelling codex agent:", conversationId);
    child.kill("SIGTERM");
    activeAgents.delete(conversationId);
  }
}

function cancelAllCodex() {
  for (const [id, child] of activeAgents) {
    child.kill("SIGTERM");
  }
  activeAgents.clear();
}

module.exports = { startCodexAgent, cancelCodexAgent, cancelAllCodex, resolveCodexBin };
