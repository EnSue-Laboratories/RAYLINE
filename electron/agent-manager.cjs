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
  args.push("--append-system-prompt", `You are running inside Claudi, a desktop GUI client for Claude Code.
The user is interacting via a chat interface, not a terminal.
Keep responses concise and conversational.
Use markdown formatting — the client renders headings, code blocks, tables, lists, and mermaid diagrams.
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

THEME for render blocks and SVGs — dark palette:
- Background: #0a0a0a
- Text: rgba(255,255,255,0.75)
- Grid/lines: rgba(255,255,255,0.08)
- Data colors: rgba(180,220,255,0.7) blue, rgba(255,200,150,0.7) orange, rgba(180,255,200,0.7) green, rgba(255,180,180,0.7) red
- Avoid saturated blue/violet/default chart colors.

INTERACTIVE TERMINAL SESSIONS:
Claudi has a built-in terminal panel (right side drawer). You have MCP tools to control it:
- create_session(name, command?, cwd?) — spawn a persistent shell session visible to the user
- send_input(name, text) — send keystrokes (use \\n for Enter, \\x03 for Ctrl+C)
- read_output(name, lines?) — read recent terminal output
- kill_session(name) — terminate a session
- list_sessions() — see all active sessions
Use these INSTEAD of the Bash tool when you need: long-running processes (dev servers, watchers), interactive prompts needing stdin, or persistent shells across turns.
The user can see and type into these terminals in real time.`);

  // Attach terminal session MCP server if available
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

  log("Starting agent:", { conversationId, model, cwd, sessionId, resumeSessionId, forkSession });
  log("Full args:", args.filter(a => a !== fullPrompt).join(" "));
  log("Prompt:", fullPrompt.slice(0, 100));

  const child = spawn("claude", args, {
    cwd: cwd || process.cwd(),
    env: { ...process.env, FORCE_COLOR: "0", PATH: process.env.PATH + ":/opt/homebrew/bin:/usr/local/bin" },
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
        // Reduce noise: skip logging thinking deltas
        const isThinking = event.type === "stream_event" && event.event?.delta?.type === "thinking_delta";
        if (!isThinking) log("Parsed event type:", event.type, "subtype:", event.subtype);
        if (event.type === "result") {
          log("Result keys:", Object.keys(event));
          log("Result full:", JSON.stringify(event));
        }
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
    log("stderr:", text);
    stderrBuffer += text;
  });

  child.on("close", (exitCode) => {
    log("Process closed, exitCode:", exitCode);
    if (stderrBuffer.trim()) {
      log("Full stderr:", stderrBuffer);
      webContents.send("agent-error", { conversationId, error: stderrBuffer.trim() });
    }
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

function rewindFiles({ sessionId, messageUuid, cwd }) {
  return new Promise((resolve, reject) => {
    // --rewind-files is a standalone operation in --print mode: rewind files then exit
    const args = [
      "--print",
      "--resume", sessionId,
      "--rewind-files", messageUuid,
    ];

    log("Rewinding files:", { sessionId, messageUuid, cwd });

    const child = spawn("claude", args, {
      cwd: cwd || process.cwd(),
      env: { ...process.env, FORCE_COLOR: "0", PATH: process.env.PATH + ":/opt/homebrew/bin:/usr/local/bin" },
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

module.exports = { startAgent, cancelAgent, cancelAll, rewindFiles };
