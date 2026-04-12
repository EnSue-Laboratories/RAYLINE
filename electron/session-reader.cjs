const fs = require("fs");
const path = require("path");
const os = require("os");

const CLAUDE_DIR = path.join(os.homedir(), ".claude");

function projectDirName(cwd) {
  return cwd.replace(/\//g, "-");
}

function findSessionFile(sessionId) {
  // Search all project dirs for this session
  const projectsDir = path.join(CLAUDE_DIR, "projects");
  if (!fs.existsSync(projectsDir)) return null;

  const projects = fs.readdirSync(projectsDir);
  for (const proj of projects) {
    const filePath = path.join(projectsDir, proj, sessionId + ".jsonl");
    if (fs.existsSync(filePath)) return { filePath, projectDir: proj };
  }
  return null;
}

function cwdFromProjectDir(projDir) {
  // Project dir names encode paths by replacing / with -
  // e.g. "-Users-kira-chan-Downloads-codex-research" -> "/Users/kira-chan/Downloads/codex-research"
  // We can't naively replace - with / because dir names may contain dashes.
  // Instead, walk common parent directories and match children against remaining encoded string.
  if (!projDir.startsWith("-")) return projDir;

  function walkAndMatch(dirPath, remaining) {
    // remaining is the encoded string left to match (without leading -)
    if (!remaining) {
      try { if (fs.statSync(dirPath).isDirectory()) return dirPath; } catch {}
      return null;
    }

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const encoded = entry.name.replace(/\//g, "-");
        // Check if remaining starts with this directory's encoded name
        if (remaining === encoded) {
          return path.join(dirPath, entry.name);
        }
        if (remaining.startsWith(encoded + "-")) {
          const result = walkAndMatch(
            path.join(dirPath, entry.name),
            remaining.slice(encoded.length + 1)
          );
          if (result) return result;
        }
      }
    } catch {}
    return null;
  }

  // Remove leading - and walk from /
  const result = walkAndMatch("/", projDir.slice(1));
  return result || projDir.replace(/-/g, "/"); // fallback
}

async function listSessions(cwd) {
  const projectDir = path.join(CLAUDE_DIR, "projects", projectDirName(cwd));

  if (!fs.existsSync(projectDir)) return [];

  const files = fs.readdirSync(projectDir).filter((f) => f.endsWith(".jsonl"));
  const sessions = [];

  for (const file of files) {
    const sessionId = file.replace(".jsonl", "");
    const filePath = path.join(projectDir, file);
    const stat = fs.statSync(filePath);

    let title = "Untitled";
    let model = null;
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const lines = content.split("\n").slice(0, 50);
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const evt = JSON.parse(line);
          if (evt.type === "user" || (evt.role === "user" && evt.type === "message")) {
            const text = evt.message?.content || evt.text || evt.display || "";
            if (typeof text === "string" && text.length > 0) {
              title = text.slice(0, 60);
              break;
            }
            if (Array.isArray(text)) {
              const t = text.find((b) => b.type === "text");
              if (t) { title = t.text.slice(0, 60); break; }
            }
          }
        } catch {}
      }
    } catch {}

    sessions.push({ id: sessionId, title, model, ts: stat.mtimeMs, cwd });
  }

  sessions.sort((a, b) => b.ts - a.ts);
  return sessions;
}

const MAX_MESSAGES = 50; // max user+assistant message pairs to load

async function loadSessionMessages(sessionId) {
  const found = findSessionFile(sessionId);
  if (!found) return { messages: [], cwd: null };

  const { filePath, projectDir } = found;
  const sessionCwd = cwdFromProjectDir(projectDir);

  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const messages = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    let evt;
    try { evt = JSON.parse(line); } catch { continue; }

    if (evt.type === "user") {
      // Extract user message text
      let text = "";
      let images = [];
      if (evt.message?.content) {
        if (typeof evt.message.content === "string") {
          text = evt.message.content;
        } else if (Array.isArray(evt.message.content)) {
          for (const block of evt.message.content) {
            if (block.type === "text") text += block.text;
            if (block.type === "tool_result") continue; // skip tool results
          }
        }
      }
      // Only add actual user messages (not tool results)
      if (text && !evt.message?.content?.some?.(b => b.type === "tool_result")) {
        messages.push({
          id: evt.uuid || "u" + Date.now() + Math.random(),
          role: "user",
          text,
          images: images.length ? images : undefined,
        });
      }
    } else if (evt.type === "assistant") {
      // Extract parts in order — text and tool calls interleaved
      const newParts = [];
      if (evt.message?.content) {
        for (const block of evt.message.content) {
          if (block.type === "text" && block.text) {
            newParts.push({ type: "text", text: block.text });
          }
          if (block.type === "tool_use") {
            newParts.push({
              type: "tool",
              id: block.id || "tc" + Date.now() + Math.random(),
              name: block.name || "unknown",
              args: block.input || {},
              result: null,
              status: "done",
            });
          }
        }
      }
      if (newParts.length > 0) {
        // Merge into the last assistant message if consecutive
        const lastMsg = messages[messages.length - 1];
        if (lastMsg && lastMsg.role === "assistant") {
          lastMsg.parts = [...(lastMsg.parts || []), ...newParts];
        } else {
          messages.push({
            id: evt.uuid || "a" + Date.now() + Math.random(),
            role: "assistant",
            parts: newParts,
            isStreaming: false,
            isThinking: false,
          });
        }
      }
    }
  }

  // Fill in tool results from user messages that contain tool_result
  for (const line of lines) {
    if (!line.trim()) continue;
    let evt;
    try { evt = JSON.parse(line); } catch { continue; }

    if (evt.type === "user" && evt.message?.content && Array.isArray(evt.message.content)) {
      for (const block of evt.message.content) {
        if (block.type === "tool_result" && block.tool_use_id) {
          for (const msg of messages) {
            if (msg.role === "assistant" && msg.parts) {
              const tp = msg.parts.find(p => p.type === "tool" && p.id === block.tool_use_id);
              if (tp) {
                tp.result = typeof block.content === "string" ? block.content : JSON.stringify(block.content);
                tp.status = "done";
              }
            }
          }
        }
      }
    }
  }

  // Keep only the last MAX_MESSAGES messages to avoid slowdowns
  const result = messages.length > MAX_MESSAGES ? messages.slice(-MAX_MESSAGES) : messages;
  return { messages: result, cwd: sessionCwd };
}

function moveSession(sessionId, newCwd) {
  const found = findSessionFile(sessionId);
  if (!found) return false;

  const { filePath: srcPath } = found;
  const destDir = path.join(CLAUDE_DIR, "projects", projectDirName(newCwd));
  const destPath = path.join(destDir, sessionId + ".jsonl");

  // Don't copy if already in the right place
  if (srcPath === destPath) return true;

  // Ensure destination project directory exists
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  fs.copyFileSync(srcPath, destPath);
  return true;
}

module.exports = { listSessions, loadSessionMessages, moveSession };
