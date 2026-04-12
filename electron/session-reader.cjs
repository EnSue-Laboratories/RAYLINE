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
    if (fs.existsSync(filePath)) return filePath;
  }
  return null;
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

async function loadSessionMessages(sessionId) {
  const filePath = findSessionFile(sessionId);
  if (!filePath) return [];

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
      // Extract assistant text and tool calls
      let text = "";
      const toolCalls = [];
      if (evt.message?.content) {
        for (const block of evt.message.content) {
          if (block.type === "text") text += block.text;
          if (block.type === "tool_use") {
            toolCalls.push({
              id: block.id || "tc" + Date.now() + Math.random(),
              name: block.name || "unknown",
              args: block.input || {},
              result: null,
              status: "done",
            });
          }
        }
      }
      // Only add if it has text or tool calls (skip thinking-only messages)
      if (text || toolCalls.length > 0) {
        // Merge into the last assistant message if it exists (consecutive assistant turns)
        const lastMsg = messages[messages.length - 1];
        if (lastMsg && lastMsg.role === "assistant") {
          // Append text and tool calls to existing assistant message
          if (text) lastMsg.text = (lastMsg.text ? lastMsg.text + text : text);
          if (toolCalls.length > 0) {
            lastMsg.toolCalls = [...(lastMsg.toolCalls || []), ...toolCalls];
          }
        } else {
          messages.push({
            id: evt.uuid || "a" + Date.now() + Math.random(),
            role: "assistant",
            text,
            toolCalls,
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
          // Find the tool call and set its result
          for (const msg of messages) {
            if (msg.role === "assistant" && msg.toolCalls) {
              const tc = msg.toolCalls.find(t => t.id === block.tool_use_id);
              if (tc) {
                tc.result = typeof block.content === "string" ? block.content : JSON.stringify(block.content);
                tc.status = "done";
              }
            }
          }
        }
      }
    }
  }

  // Clean up internal fields
  for (const msg of messages) {
    delete msg._msgId;
  }

  return messages;
}

module.exports = { listSessions, loadSessionMessages };
