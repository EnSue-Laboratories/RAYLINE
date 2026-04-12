const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

const activeAgents = new Map();

function log(...args) {
  console.log("[agent-manager]", ...args);
}

function startAgent({ conversationId, prompt, model, cwd, images, files, sessionId, resumeSessionId, forkSession }, webContents) {
  cancelAgent(conversationId);

  const args = ["--print", "--output-format=stream-json", "--verbose", "--include-partial-messages", "--dangerously-skip-permissions"];

  if (model) args.push("--model", model);

  if (resumeSessionId) {
    args.push("--resume", resumeSessionId);
    if (forkSession) args.push("--fork-session");
  } else if (sessionId) {
    args.push("--session-id", sessionId);
  }

  let fullPrompt = prompt;

  // Save images to temp files and reference paths in prompt
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

  args.push(fullPrompt);

  log("Starting agent:", { conversationId, model, cwd, sessionId, resumeSessionId });
  log("Command: claude", args.join(" ").slice(0, 200) + "...");

  const child = spawn("claude", args, {
    cwd: cwd || process.cwd(),
    env: { ...process.env, FORCE_COLOR: "0", PATH: process.env.PATH + ":/opt/homebrew/bin:/usr/local/bin" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  log("Spawned PID:", child.pid);

  activeAgents.set(conversationId, child);

  let buffer = "";

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
        log("Parsed event type:", event.type, "subtype:", event.subtype);
        webContents.send("agent-stream", { conversationId, event });
      } catch (e) {
        log("Failed to parse JSON line:", line.slice(0, 200), "error:", e.message);
      }
    }
  });

  child.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    log("stderr:", text.slice(0, 500));
    webContents.send("agent-error", { conversationId, error: text });
  });

  child.on("close", (exitCode) => {
    log("Process closed, exitCode:", exitCode);
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

function cancelAgent(conversationId) {
  const child = activeAgents.get(conversationId);
  if (child) {
    log("Cancelling agent:", conversationId);
    child.kill("SIGTERM");
    activeAgents.delete(conversationId);
  }
}

function cancelAll() {
  for (const [id, child] of activeAgents) {
    child.kill("SIGTERM");
  }
  activeAgents.clear();
}

module.exports = { startAgent, cancelAgent, cancelAll };
