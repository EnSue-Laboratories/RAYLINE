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

  // Inject Claudi-specific instructions (won't affect CLI usage)
  args.push("--append-system-prompt", [
    "You are running inside Claudi, a desktop GUI client for Claude Code.",
    "The user is interacting via a chat interface, not a terminal.",
    "Keep responses concise and conversational.",
    "Use markdown formatting — the client renders headings, code blocks, tables, lists, and mermaid diagrams.",
    "When showing diagrams, prefer mermaid code blocks (```mermaid).",
    "Do not ask the user to run terminal commands — you have full tool access to do it yourself.",
  ].join(" "));

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

        // Track when AskUserQuestion tool_use starts streaming
        if (
          event.type === "stream_event" &&
          event.event?.type === "content_block_start" &&
          event.event?.content_block?.type === "tool_use" &&
          event.event?.content_block?.name === "AskUserQuestion"
        ) {
          child._waitingForQuestion = true;
        }

        // Kill the process once the AskUserQuestion args are fully streamed,
        // so Claude pauses and the renderer can show the question UI.
        if (
          child._waitingForQuestion &&
          event.type === "stream_event" &&
          event.event?.type === "content_block_stop"
        ) {
          log("AskUserQuestion fully streamed — killing process to wait for user answer");
          child._waitingForQuestion = false;
          child.kill("SIGTERM");
        }
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
