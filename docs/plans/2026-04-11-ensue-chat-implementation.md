# Ensue Chat Electron Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert the Ensue Chat React UI into a native Electron app that wraps Claude Code CLI with streaming responses, tool call visibility, image/file input, and message editing.

**Architecture:** Electron main process spawns `claude --print --output-format=stream-json` as child processes per conversation. JSONL stdout is parsed line-by-line and forwarded to the React renderer via IPC. Claude Code handles all session persistence natively.

**Tech Stack:** Electron, React 19, Vite, lucide-react, Claude Code CLI (`--print --output-format=stream-json`)

---

### Task 1: Electron Scaffolding

**Files:**
- Create: `electron/main.js`
- Create: `electron/preload.js`
- Modify: `package.json`
- Modify: `vite.config.js`
- Modify: `index.html`

**Step 1: Install Electron and electron-builder**

Run: `npm install --save-dev electron electron-builder concurrently wait-on`

**Step 2: Create `electron/main.js`**

```js
const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");

const isDev = !app.isPackaged;
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 18 },
    backgroundColor: "#000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// IPC: folder picker
ipcMain.handle("folder-pick", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
  });
  return result.canceled ? null : result.filePaths[0];
});
```

**Step 3: Create `electron/preload.js`**

```js
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  agentStart: (opts) => ipcRenderer.send("agent-start", opts),
  agentCancel: (id) => ipcRenderer.send("agent-cancel", id),
  agentEditAndResend: (opts) => ipcRenderer.send("agent-edit-resend", opts),
  onAgentStream: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on("agent-stream", handler);
    return () => ipcRenderer.removeListener("agent-stream", handler);
  },
  onAgentDone: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on("agent-done", handler);
    return () => ipcRenderer.removeListener("agent-done", handler);
  },
  onAgentError: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on("agent-error", handler);
    return () => ipcRenderer.removeListener("agent-error", handler);
  },
  pickFolder: () => ipcRenderer.invoke("folder-pick"),
  listSessions: (cwd) => ipcRenderer.invoke("list-sessions", cwd),
});
```

**Step 4: Update `package.json`**

Add to package.json:
```json
{
  "main": "electron/main.js",
  "scripts": {
    "dev": "vite",
    "dev:electron": "concurrently \"vite\" \"wait-on http://localhost:5173 && electron .\"",
    "build": "vite build",
    "build:electron": "vite build && electron-builder",
    "preview": "vite preview"
  }
}
```

**Step 5: Update `vite.config.js`**

```js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
});
```

**Step 6: Verify it launches**

Run: `npm run dev:electron`
Expected: Electron window opens showing the existing chat UI

**Step 7: Commit**

```bash
git add electron/ package.json vite.config.js
git commit -m "feat: add Electron scaffolding with main process, preload, and dev scripts"
```

---

### Task 2: Agent Manager (spawn Claude CLI, parse JSONL)

**Files:**
- Create: `electron/agent-manager.js`
- Modify: `electron/main.js`

**Step 1: Create `electron/agent-manager.js`**

```js
const { spawn } = require("child_process");
const { v4: uuidv4 } = require("crypto");

const activeAgents = new Map();

function startAgent({ conversationId, prompt, model, cwd, images, files, sessionId, resumeSessionId, forkSession }, webContents) {
  // Kill existing agent for this conversation
  cancelAgent(conversationId);

  const args = ["--print", "--output-format=stream-json"];

  if (model) args.push("--model", model);

  if (resumeSessionId) {
    args.push("--resume", resumeSessionId);
    if (forkSession) args.push("--fork-session");
  } else if (sessionId) {
    args.push("--session-id", sessionId);
  }

  // Append file paths to prompt
  let fullPrompt = prompt;
  if (files && files.length > 0) {
    const filePaths = files.map((f) => f.path).join("\n");
    fullPrompt = `[Attached files:\n${filePaths}]\n\n${prompt}`;
  }

  args.push(fullPrompt);

  const child = spawn("claude", args, {
    cwd: cwd || process.cwd(),
    shell: true,
    env: { ...process.env, FORCE_COLOR: "0" },
    stdio: ["pipe", "pipe", "pipe"],
  });

  activeAgents.set(conversationId, child);

  let buffer = "";

  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop(); // keep incomplete line in buffer

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        webContents.send("agent-stream", { conversationId, event });
      } catch {
        // non-JSON line, ignore
      }
    }
  });

  child.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    webContents.send("agent-error", { conversationId, error: text });
  });

  child.on("close", (exitCode) => {
    // flush remaining buffer
    if (buffer.trim()) {
      try {
        const event = JSON.parse(buffer);
        webContents.send("agent-stream", { conversationId, event });
      } catch {}
    }
    activeAgents.delete(conversationId);
    webContents.send("agent-done", { conversationId, exitCode });
  });

  child.on("error", (err) => {
    activeAgents.delete(conversationId);
    webContents.send("agent-error", { conversationId, error: err.message });
  });

  return child;
}

function cancelAgent(conversationId) {
  const child = activeAgents.get(conversationId);
  if (child) {
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
```

**Step 2: Wire IPC handlers in `electron/main.js`**

Add to main.js after the folder-pick handler:

```js
const { startAgent, cancelAgent, cancelAll } = require("./agent-manager");

ipcMain.on("agent-start", (event, opts) => {
  startAgent(opts, event.sender);
});

ipcMain.on("agent-cancel", (_event, { conversationId }) => {
  cancelAgent(conversationId);
});

ipcMain.on("agent-edit-resend", (event, opts) => {
  startAgent({ ...opts, forkSession: true }, event.sender);
});

app.on("before-quit", () => {
  cancelAll();
});
```

**Step 3: Install uuid**

Run: `npm install uuid`

**Step 4: Commit**

```bash
git add electron/agent-manager.js electron/main.js package.json
git commit -m "feat: add agent manager for spawning Claude CLI and parsing JSONL"
```

---

### Task 3: Session Listing (read Claude Code history)

**Files:**
- Create: `electron/session-reader.js`
- Modify: `electron/main.js`

**Step 1: Create `electron/session-reader.js`**

```js
const fs = require("fs");
const path = require("path");
const os = require("os");
const readline = require("readline");

const CLAUDE_DIR = path.join(os.homedir(), ".claude");

function projectDirName(cwd) {
  return cwd.replace(/\//g, "-");
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

    // Read first few lines to find a title (first user message)
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

    sessions.push({
      id: sessionId,
      title,
      model,
      ts: stat.mtimeMs,
      cwd,
    });
  }

  // Sort by most recent
  sessions.sort((a, b) => b.ts - a.ts);
  return sessions;
}

module.exports = { listSessions };
```

**Step 2: Wire IPC in `electron/main.js`**

```js
const { listSessions } = require("./session-reader");

ipcMain.handle("list-sessions", async (_event, cwd) => {
  return listSessions(cwd);
});
```

**Step 3: Commit**

```bash
git add electron/session-reader.js electron/main.js
git commit -m "feat: add session reader to list Claude Code conversation history"
```

---

### Task 4: useAgent Hook (renderer IPC bridge)

**Files:**
- Create: `src/hooks/useAgent.js`

**Step 1: Create `src/hooks/useAgent.js`**

```js
import { useState, useCallback, useEffect, useRef } from "react";

export default function useAgent() {
  const [conversations, setConversations] = useState(new Map());
  const cleanupRefs = useRef([]);

  useEffect(() => {
    if (!window.api) return;

    const offStream = window.api.onAgentStream(({ conversationId, event }) => {
      setConversations((prev) => {
        const next = new Map(prev);
        const convo = next.get(conversationId) || { messages: [], isStreaming: true, error: null };

        // Process event based on type
        const msgs = [...convo.messages];
        let lastMsg = msgs[msgs.length - 1];

        if (event.type === "assistant" || (event.type === "content_block_delta" && event.delta?.type === "text_delta")) {
          const text = event.text || event.delta?.text || "";
          if (!lastMsg || lastMsg.role !== "assistant") {
            msgs.push({ id: "a" + Date.now(), role: "assistant", text, toolCalls: [], isStreaming: true });
          } else {
            msgs[msgs.length - 1] = { ...lastMsg, text: lastMsg.text + text };
          }
        } else if (event.type === "tool_use" || event.type === "tool_call") {
          if (!lastMsg || lastMsg.role !== "assistant") {
            lastMsg = { id: "a" + Date.now(), role: "assistant", text: "", toolCalls: [], isStreaming: true };
            msgs.push(lastMsg);
          }
          const toolCalls = [...(lastMsg.toolCalls || [])];
          const subtype = event.subtype || "started";

          if (subtype === "started" || subtype === "pending") {
            toolCalls.push({
              id: event.callId || event.id || "tc" + Date.now(),
              name: event.toolName || event.name || "unknown",
              args: event.args || event.input || {},
              result: null,
              status: "running",
            });
          } else if (subtype === "completed") {
            const idx = toolCalls.findIndex((t) => t.id === (event.callId || event.id));
            if (idx >= 0) {
              toolCalls[idx] = { ...toolCalls[idx], result: event.result || event.output, status: "done" };
            }
          }
          msgs[msgs.length - 1] = { ...lastMsg, toolCalls };
        } else if (event.type === "result") {
          if (lastMsg && lastMsg.role === "assistant") {
            msgs[msgs.length - 1] = { ...lastMsg, isStreaming: false };
          }
        }

        next.set(conversationId, { ...convo, messages: msgs });
        return next;
      });
    });

    const offDone = window.api.onAgentDone(({ conversationId }) => {
      setConversations((prev) => {
        const next = new Map(prev);
        const convo = next.get(conversationId);
        if (convo) {
          const msgs = convo.messages.map((m) =>
            m.role === "assistant" && m.isStreaming ? { ...m, isStreaming: false } : m
          );
          next.set(conversationId, { ...convo, messages: msgs, isStreaming: false });
        }
        return next;
      });
    });

    const offError = window.api.onAgentError(({ conversationId, error }) => {
      setConversations((prev) => {
        const next = new Map(prev);
        const convo = next.get(conversationId) || { messages: [], isStreaming: false, error: null };
        next.set(conversationId, { ...convo, error, isStreaming: false });
        return next;
      });
    });

    cleanupRefs.current = [offStream, offDone, offError];
    return () => cleanupRefs.current.forEach((fn) => fn?.());
  }, []);

  const sendMessage = useCallback(({ conversationId, sessionId, prompt, model, cwd, images, files, resumeSessionId, forkSession }) => {
    // Add user message to state
    setConversations((prev) => {
      const next = new Map(prev);
      const convo = next.get(conversationId) || { messages: [], isStreaming: false, error: null };
      const msgs = [...convo.messages, { id: "u" + Date.now(), role: "user", text: prompt, images, files }];
      next.set(conversationId, { messages: msgs, isStreaming: true, error: null });
      return next;
    });

    if (window.api) {
      window.api.agentStart({ conversationId, sessionId, prompt, model, cwd, images, files, resumeSessionId, forkSession });
    }
  }, []);

  const cancelMessage = useCallback((conversationId) => {
    if (window.api) {
      window.api.agentCancel({ conversationId });
    }
  }, []);

  const editAndResend = useCallback(({ conversationId, sessionId, messageIndex, newText, model, cwd }) => {
    // Trim messages after the edited one
    setConversations((prev) => {
      const next = new Map(prev);
      const convo = next.get(conversationId);
      if (convo) {
        const msgs = convo.messages.slice(0, messageIndex);
        msgs.push({ id: "u" + Date.now(), role: "user", text: newText });
        next.set(conversationId, { messages: msgs, isStreaming: true, error: null });
      }
      return next;
    });

    if (window.api) {
      window.api.agentEditAndResend({
        conversationId,
        resumeSessionId: sessionId,
        forkSession: true,
        prompt: newText,
        model,
        cwd,
      });
    }
  }, []);

  const getConversation = useCallback((id) => {
    return conversations.get(id) || { messages: [], isStreaming: false, error: null };
  }, [conversations]);

  return { conversations, getConversation, sendMessage, cancelMessage, editAndResend };
}
```

**Step 2: Commit**

```bash
git add src/hooks/useAgent.js
git commit -m "feat: add useAgent hook for IPC streaming state management"
```

---

### Task 5: Update Models Data

**Files:**
- Modify: `src/data/models.js`

**Step 1: Update `src/data/models.js`**

```js
export const MODELS = [
  { id: "opus",   name: "Claude Opus",   tag: "OPUS",   cliFlag: "opus"   },
  { id: "sonnet", name: "Claude Sonnet", tag: "SONNET", cliFlag: "sonnet" },
  { id: "haiku",  name: "Claude Haiku",  tag: "HAIKU",  cliFlag: "haiku"  },
];

export const getM = (id) => MODELS.find((m) => m.id === id) || MODELS[0];
```

**Step 2: Commit**

```bash
git add src/data/models.js
git commit -m "feat: update models to real Claude model names with CLI flags"
```

---

### Task 6: ToolCallBlock Component

**Files:**
- Create: `src/components/ToolCallBlock.jsx`

**Step 1: Create the component**

```jsx
import { useState } from "react";
import { ChevronRight, ChevronDown, Terminal, FileText, Pencil, Search, Code } from "lucide-react";

const TOOL_ICONS = {
  Bash: Terminal,
  Read: FileText,
  Edit: Pencil,
  Grep: Search,
  Write: FileText,
  Glob: Search,
};

export default function ToolCallBlock({ tool }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = TOOL_ICONS[tool.name] || Code;
  const isRunning = tool.status === "running";

  return (
    <div
      style={{
        margin: "8px 0",
        borderRadius: 8,
        border: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(255,255,255,0.02)",
        overflow: "hidden",
      }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          padding: "8px 12px",
          background: "none",
          border: "none",
          color: "rgba(255,255,255,0.5)",
          cursor: "pointer",
          fontSize: 11,
          fontFamily: "'JetBrains Mono',monospace",
          textAlign: "left",
        }}
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Icon size={13} strokeWidth={1.5} />
        <span style={{ color: "rgba(255,255,255,0.7)" }}>{tool.name}</span>
        {isRunning && (
          <span style={{
            width: 6, height: 6, borderRadius: "50%",
            background: "rgba(130,200,255,0.6)",
            animation: "blink 1.2s steps(1) infinite",
            marginLeft: 4,
          }} />
        )}
        {tool.status === "done" && (
          <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 10 }}>done</span>
        )}
      </button>

      {expanded && (
        <div style={{ padding: "0 12px 10px", fontSize: 11, fontFamily: "'JetBrains Mono',monospace" }}>
          {tool.args && Object.keys(tool.args).length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ color: "rgba(255,255,255,0.3)", marginBottom: 4 }}>ARGS</div>
              <pre style={{
                color: "rgba(255,255,255,0.5)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                margin: 0,
                padding: 8,
                background: "rgba(0,0,0,0.3)",
                borderRadius: 6,
                fontSize: 10,
                maxHeight: 200,
                overflow: "auto",
              }}>
                {typeof tool.args === "string" ? tool.args : JSON.stringify(tool.args, null, 2)}
              </pre>
            </div>
          )}
          {tool.result != null && (
            <div>
              <div style={{ color: "rgba(255,255,255,0.3)", marginBottom: 4 }}>RESULT</div>
              <pre style={{
                color: "rgba(255,255,255,0.5)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                margin: 0,
                padding: 8,
                background: "rgba(0,0,0,0.3)",
                borderRadius: 6,
                fontSize: 10,
                maxHeight: 300,
                overflow: "auto",
              }}>
                {typeof tool.result === "string" ? tool.result : JSON.stringify(tool.result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/ToolCallBlock.jsx
git commit -m "feat: add collapsible ToolCallBlock component"
```

---

### Task 7: ImagePreview Component

**Files:**
- Create: `src/components/ImagePreview.jsx`

**Step 1: Create the component**

```jsx
import { X, FileText } from "lucide-react";

export default function ImagePreview({ items, onRemove }) {
  if (!items || items.length === 0) return null;

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
      {items.map((item, i) => (
        <div
          key={i}
          style={{
            position: "relative",
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(255,255,255,0.03)",
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
          }}
        >
          {item.type === "image" ? (
            <img
              src={item.dataUrl}
              alt=""
              style={{ height: 48, maxWidth: 80, objectFit: "cover", display: "block" }}
            />
          ) : (
            <div style={{
              padding: "8px 12px",
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11,
              fontFamily: "'JetBrains Mono',monospace",
              color: "rgba(255,255,255,0.5)",
            }}>
              <FileText size={13} strokeWidth={1.5} />
              {item.name}
            </div>
          )}

          <button
            onClick={() => onRemove(i)}
            style={{
              position: item.type === "image" ? "absolute" : "relative",
              top: item.type === "image" ? 2 : "auto",
              right: item.type === "image" ? 2 : "auto",
              width: 18,
              height: 18,
              borderRadius: "50%",
              background: "rgba(0,0,0,0.6)",
              border: "none",
              color: "rgba(255,255,255,0.6)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              marginLeft: item.type === "file" ? 4 : 0,
              marginRight: item.type === "file" ? 4 : 0,
            }}
          >
            <X size={10} />
          </button>
        </div>
      ))}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/ImagePreview.jsx
git commit -m "feat: add ImagePreview component for attached images and files"
```

---

### Task 8: Update Message Component (tool calls + edit button)

**Files:**
- Modify: `src/components/Message.jsx`

**Step 1: Rewrite Message.jsx**

```jsx
import { useState } from "react";
import { Pencil } from "lucide-react";
import CopyBtn from "./CopyBtn";
import ToolCallBlock from "./ToolCallBlock";

export default function Message({ msg, onEdit }) {
  const isUser = msg.role === "user";
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(msg.text);

  const handleSubmitEdit = () => {
    if (editText.trim() && editText !== msg.text) {
      onEdit?.(editText.trim());
    }
    setEditing(false);
  };

  const handleEditKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmitEdit();
    }
    if (e.key === "Escape") {
      setEditing(false);
      setEditText(msg.text);
    }
  };

  if (isUser) {
    return (
      <div
        style={{
          marginBottom: 6,
          animation: "msgIn .4s cubic-bezier(.16,1,.3,1)",
          textAlign: "right",
          paddingTop: 28,
          position: "relative",
        }}
        className="msg-user"
      >
        <div style={{
          fontSize: 9,
          fontFamily: "'JetBrains Mono',monospace",
          color: "rgba(255,255,255,0.2)",
          letterSpacing: ".14em",
          marginBottom: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 8,
        }}>
          YOU
          {onEdit && !editing && (
            <button
              onClick={() => setEditing(true)}
              style={{
                background: "none",
                border: "none",
                color: "rgba(255,255,255,0.15)",
                cursor: "pointer",
                padding: 2,
                display: "flex",
                transition: "color .2s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.4)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.15)"; }}
            >
              <Pencil size={10} strokeWidth={1.5} />
            </button>
          )}
        </div>

        {editing ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={handleEditKeyDown}
              autoFocus
              style={{
                width: "100%",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8,
                color: "rgba(255,255,255,0.9)",
                fontSize: 14,
                lineHeight: 1.7,
                fontFamily: "system-ui,sans-serif",
                padding: "10px 12px",
                resize: "vertical",
                minHeight: 60,
              }}
            />
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={() => { setEditing(false); setEditText(msg.text); }}
                style={{
                  background: "none",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 6,
                  color: "rgba(255,255,255,0.4)",
                  padding: "4px 12px",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >Cancel</button>
              <button
                onClick={handleSubmitEdit}
                style={{
                  background: "rgba(255,255,255,0.8)",
                  border: "none",
                  borderRadius: 6,
                  color: "#000",
                  padding: "4px 12px",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >Send</button>
            </div>
          </div>
        ) : (
          <div style={{
            color: "rgba(255,255,255,0.92)",
            fontSize: 15,
            lineHeight: 1.7,
            fontFamily: "system-ui,-apple-system,sans-serif",
            fontWeight: 400,
          }}>
            {msg.text}
          </div>
        )}

        {msg.images && msg.images.length > 0 && (
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 8 }}>
            {msg.images.map((img, i) => (
              <img key={i} src={img} alt="" style={{ height: 40, borderRadius: 6, opacity: 0.8 }} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Assistant message
  return (
    <div
      style={{
        marginBottom: 44,
        animation: "msgIn .4s cubic-bezier(.16,1,.3,1)",
        textAlign: "left",
        paddingTop: 8,
      }}
    >
      <div style={{
        fontSize: 9,
        fontFamily: "'JetBrains Mono',monospace",
        color: "rgba(255,255,255,0.2)",
        letterSpacing: ".14em",
        marginBottom: 12,
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}>
        RESPONSE
        {msg.isStreaming && (
          <span style={{
            width: 6, height: 6, borderRadius: "50%",
            background: "rgba(130,200,255,0.6)",
            animation: "blink 1.2s steps(1) infinite",
          }} />
        )}
      </div>

      {msg.toolCalls && msg.toolCalls.map((tc) => (
        <ToolCallBlock key={tc.id} tool={tc} />
      ))}

      {msg.text && (
        <div style={{
          color: "rgba(255,255,255,0.75)",
          fontSize: 15,
          lineHeight: 1.85,
          fontFamily: "'Newsreader','Iowan Old Style',Georgia,serif",
          letterSpacing: "0.008em",
          whiteSpace: "pre-wrap",
        }}>
          {msg.text}
        </div>
      )}

      {!msg.isStreaming && msg.text && (
        <div style={{ marginTop: 8 }}>
          <CopyBtn text={msg.text} />
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/Message.jsx
git commit -m "feat: update Message with tool call rendering and inline edit"
```

---

### Task 9: Wire Up App.jsx (replace stubs with real IPC)

**Files:**
- Modify: `src/App.jsx`
- Delete: `src/data/conversations.js` (no longer needed)

**Step 1: Rewrite App.jsx**

Replace the stub-based App with one that uses `useAgent` hook, real session IDs, folder picker, and IPC-driven messaging. Remove the `CONVOS_INIT` import and `STUB_REPLY` constant. Wire `sendMessage`, `cancelMessage`, and `editAndResend` from the hook to the UI. Add CWD state with folder picker support.

Key changes:
- `useAgent()` manages all conversation state
- New conversation generates a UUID session ID
- `handleSend` calls `sendMessage` with IPC
- `handleEdit` calls `editAndResend` with fork
- CWD shown in footer, changeable via folder picker
- Sidebar populated from `useAgent().conversations` map

**Step 2: Commit**

```bash
git add src/App.jsx
git rm src/data/conversations.js
git commit -m "feat: wire App to real Claude Code CLI via useAgent hook"
```

---

### Task 10: Update ChatArea (image paste/drop, cancel button)

**Files:**
- Modify: `src/components/ChatArea.jsx`

**Step 1: Add image/file paste and drop handling**

Add state for `attachments` array. Add `onPaste` handler to textarea that reads clipboard images. Add `onDragOver`/`onDrop` on the input container that reads dropped files (images as base64 dataUrls, other files as `{ type: "file", name, path }`). Show `ImagePreview` above the input. Pass attachments to `onSend`. Add a cancel/stop button that appears during streaming.

**Step 2: Commit**

```bash
git add src/components/ChatArea.jsx
git commit -m "feat: add image paste, file drop, and cancel button to ChatArea"
```

---

### Task 11: Update Sidebar (real sessions, folder picker)

**Files:**
- Modify: `src/components/Sidebar.jsx`

**Step 1: Update Sidebar**

Replace dummy data rendering with real conversation data from `useAgent`. Add a folder/CWD indicator at the bottom of the sidebar showing the current working directory (truncated to last 2 path segments). Add a click handler on the CWD indicator to trigger `window.api.pickFolder()`.

**Step 2: Commit**

```bash
git add src/components/Sidebar.jsx
git commit -m "feat: update Sidebar with real sessions and CWD picker"
```

---

### Task 12: Integration Test — End to End

**Step 1: Run the app**

Run: `npm run dev:electron`

**Step 2: Test new conversation**

- Click + to create new conversation
- Type a simple prompt like "What is 2+2?"
- Verify streaming response appears token by token
- Verify tool calls show as collapsible blocks (if triggered)

**Step 3: Test image paste**

- Copy an image to clipboard
- Paste in the input area
- Verify thumbnail preview appears
- Send message with image

**Step 4: Test file drop**

- Drag a .js file onto the input
- Verify file chip appears
- Send and verify Claude receives context

**Step 5: Test message edit**

- Click pencil icon on a user message
- Edit text and submit
- Verify conversation forks and new response streams

**Step 6: Test model switching**

- Use model picker to switch between sonnet/opus/haiku
- Send a message and verify different model is used

**Step 7: Test cancel**

- Send a long prompt
- Click cancel during streaming
- Verify streaming stops

**Step 8: Final commit**

```bash
git add -A
git commit -m "feat: Ensue Chat v1.0 — Electron Claude Code wrapper"
```
