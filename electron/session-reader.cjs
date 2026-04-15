const fs = require("fs");
const path = require("path");
const os = require("os");

const CLAUDE_DIR = path.join(os.homedir(), ".claude");
const CODEX_DIR = path.join(os.homedir(), ".codex");
const MAX_MESSAGES = 50; // max user+assistant message pairs to load
const CODEX_USER_PROMPT_MARKER = "--- USER PROMPT ---";

function projectDirName(cwd) {
  return cwd.replace(/\//g, "-");
}

function extractSessionCwdFromFile(filePath) {
  try {
    const lines = fs.readFileSync(filePath, "utf-8").split("\n").slice(0, 200);
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const evt = JSON.parse(line);
        if (typeof evt.cwd === "string" && evt.cwd) {
          return evt.cwd;
        }
      } catch {}
    }
  } catch {}
  return null;
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

  function encodedDirNames(entryName) {
    const names = [entryName];
    if (entryName.startsWith(".")) {
      names.push(`-${entryName.slice(1)}`);
      names.push(entryName.slice(1));
    }
    return [...new Set(names)];
  }

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
        for (const encoded of encodedDirNames(entry.name)) {
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
      }
    } catch {}
    return null;
  }

  // Remove leading - and walk from /
  const result = walkAndMatch("/", projDir.slice(1));
  return result || projDir.replace(/-/g, "/"); // fallback
}

function findSessionCwd(sessionId) {
  const found = findSessionFile(sessionId);
  if (!found) return null;
  return extractSessionCwdFromFile(found.filePath) || cwdFromProjectDir(found.projectDir);
}

function walkJsonlFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...walkJsonlFiles(fullPath));
      } else if (entry.name.endsWith(".jsonl")) {
        results.push(fullPath);
      }
    }
  } catch {}
  return results;
}

function findCodexSessionFile(threadId) {
  const sessionsDir = path.join(CODEX_DIR, "sessions");
  const files = walkJsonlFiles(sessionsDir);
  for (const filePath of files) {
    if (path.basename(filePath).includes(threadId)) {
      return filePath;
    }
  }
  return null;
}

function stripCodexSystemContext(text) {
  if (typeof text !== "string") return "";
  const trimmed = text.trim();
  if (!trimmed.startsWith("System context for this run:")) {
    return trimmed;
  }

  const markerIndex = trimmed.indexOf(CODEX_USER_PROMPT_MARKER);
  if (markerIndex === -1) return trimmed;

  return trimmed.slice(markerIndex + CODEX_USER_PROMPT_MARKER.length).trim();
}

function loadCodexSessionMessages(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const messages = [];
  let sessionCwd = null;

  for (const line of lines) {
    if (!line.trim()) continue;
    let evt;
    try { evt = JSON.parse(line); } catch { continue; }

    if (evt.type === "session_meta" && evt.payload?.cwd) {
      sessionCwd = evt.payload.cwd;
      continue;
    }

    if (evt.type === "event_msg") continue;

    if (evt.type === "response_item" && evt.payload?.role === "user") {
      let text = "";
      if (Array.isArray(evt.payload.content)) {
        for (const block of evt.payload.content) {
          if (block.type === "input_text" && block.text) {
            text += block.text;
          }
        }
      }
      // Skip system injections
      const trimmed = stripCodexSystemContext(text);
      if (!trimmed || trimmed.startsWith("<") || trimmed.startsWith("#")) continue;

      messages.push({
        id: "u" + Date.now() + Math.random(),
        role: "user",
        text: trimmed,
      });
    } else if (
      evt.type === "response_item" &&
      evt.payload?.type === "message" &&
      evt.payload?.role === "assistant"
    ) {
      let text = "";
      if (Array.isArray(evt.payload.content)) {
        for (const block of evt.payload.content) {
          if (block.type === "output_text" && block.text) {
            text += block.text;
          }
        }
      }
      if (text) {
        const lastMsg = messages[messages.length - 1];
        const part = { type: "text", text };
        if (lastMsg && lastMsg.role === "assistant") {
          lastMsg.parts.push(part);
        } else {
          messages.push({
            id: "a" + Date.now() + Math.random(),
            role: "assistant",
            parts: [part],
            isStreaming: false,
            isThinking: false,
          });
        }
      }
    }
  }

  const result = messages.length > MAX_MESSAGES ? messages.slice(-MAX_MESSAGES) : messages;
  return { messages: result, cwd: sessionCwd };
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
              if (!text.startsWith("Base directory for this skill:")) {
                const cleaned = text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "").trim();
                if (cleaned) { title = cleaned.slice(0, 60); break; }
              }
            }
            if (Array.isArray(text)) {
              const t = text.find((b) => b.type === "text" && b.text && !b.text.startsWith("Base directory for this skill:"));
              if (t) {
                const cleaned = t.text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "").trim();
                if (cleaned) { title = cleaned.slice(0, 60); break; }
              }
            }
          }
        } catch {}
      }
    } catch {}

    sessions.push({ id: sessionId, title, model, ts: stat.mtimeMs, cwd });
  }

  // Scan Codex sessions
  const codexSessionsDir = path.join(CODEX_DIR, "sessions");
  const codexFiles = walkJsonlFiles(codexSessionsDir);
  for (const codexFile of codexFiles) {
    try {
      const firstLine = fs.readFileSync(codexFile, "utf-8").split("\n")[0];
      if (!firstLine.trim()) continue;
      const meta = JSON.parse(firstLine);
      if (meta.type !== "session_meta" || meta.payload?.cwd !== cwd) continue;

      const threadId = meta.payload.id;
      const stat = fs.statSync(codexFile);

      // Find first user message for title
      let title = "Untitled";
      const content = fs.readFileSync(codexFile, "utf-8");
      const allLines = content.split("\n").slice(0, 100);
      for (const line of allLines) {
        if (!line.trim()) continue;
        let evt;
        try { evt = JSON.parse(line); } catch { continue; }
        if (evt.type === "response_item" && evt.payload?.role === "user") {
          let text = "";
          if (Array.isArray(evt.payload.content)) {
            for (const block of evt.payload.content) {
              if (block.type === "input_text" && block.text) {
                text += block.text;
              }
            }
          }
          const trimmed = stripCodexSystemContext(text);
          if (trimmed && !trimmed.startsWith("<") && !trimmed.startsWith("#")) {
            title = trimmed.slice(0, 60);
            break;
          }
        }
      }

      sessions.push({ id: threadId, title, model: null, ts: stat.mtimeMs, cwd, provider: "codex" });
    } catch {}
  }

  sessions.sort((a, b) => b.ts - a.ts);
  return sessions;
}

async function loadSessionMessages(sessionId) {
  const found = findSessionFile(sessionId);
  if (!found) {
    // Fall back to Codex sessions
    const codexFile = findCodexSessionFile(sessionId);
    if (codexFile) {
      return loadCodexSessionMessages(codexFile);
    }
    return { messages: [], cwd: null };
  }

  const { filePath, projectDir } = found;
  const sessionCwd = extractSessionCwdFromFile(filePath) || cwdFromProjectDir(projectDir);

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
      // Strip system-injected content (skill prompts, system-reminders)
      if (text.startsWith("Base directory for this skill:")) text = "";
      text = text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "").trim();

      // Only add actual user messages (not tool results or system-injected content)
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

module.exports = { listSessions, loadSessionMessages, moveSession, findSessionCwd };
