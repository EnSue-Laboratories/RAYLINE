# Interactive Terminal Sessions — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add persistent, interactive terminal sessions to Claudi so Claude can spawn shells, send input to running processes, and read output — and the user can see/interact with them in a side drawer.

**Architecture:** Electron main process manages PTY sessions via node-pty and runs a local WebSocket server. A thin MCP server script (stdio transport) proxies Claude's tool calls to the WebSocket server. The renderer connects via IPC for live output streaming and renders terminals with xterm.js.

**Tech Stack:** node-pty, xterm.js + xterm-addon-fit, ws (WebSocket), @modelcontextprotocol/sdk

---

### Task 1: Install dependencies

**Step 1: Install node-pty, xterm.js, ws, and MCP SDK**

```bash
cd /Users/kira-chan/Downloads/Ensue-Chat
npm install node-pty xterm xterm-addon-fit ws @modelcontextprotocol/sdk
```

node-pty is a native module — it needs to be rebuilt for Electron. Add a postinstall script.

**Step 2: Add electron-rebuild for native modules**

```bash
npm install --save-dev electron-rebuild
```

**Step 3: Add rebuild script to package.json**

In `package.json`, add to `"scripts"`:
```json
"rebuild": "electron-rebuild -f -w node-pty"
```

**Step 4: Run the rebuild**

```bash
npm run rebuild
```

Expected: Compiles node-pty against Electron's Node headers. No errors.

**Step 5: Verify node-pty loads in Electron**

Create a quick test: in Electron main console, `require('node-pty')` should not throw.

**Step 6: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add node-pty, xterm.js, ws, mcp sdk dependencies"
```

---

### Task 2: Terminal session manager (Electron main process)

**Files:**
- Create: `electron/terminal-manager.cjs`

This module manages PTY sessions and exposes them over a local WebSocket server so the MCP server can reach them.

**Step 1: Write `electron/terminal-manager.cjs`**

```javascript
const pty = require("node-pty");
const os = require("os");
const WebSocket = require("ws");

const MAX_SESSIONS = 8;
const SCROLLBACK_LIMIT = 5000; // lines kept in memory

const sessions = new Map(); // name -> { pty, buffer, cwd, command, createdAt }
let wss = null;
let wssPort = null;
let outputCallback = null; // (name, data) => void — for IPC to renderer

function log(...args) {
  console.log("[terminal-manager]", ...args);
}

// --- Session CRUD ---

function createSession({ name, command, cwd }) {
  if (sessions.has(name)) {
    return { error: `Session "${name}" already exists` };
  }
  if (sessions.size >= MAX_SESSIONS) {
    return { error: `Maximum ${MAX_SESSIONS} sessions reached` };
  }

  const shell = command || process.env.SHELL || (os.platform() === "win32" ? "powershell.exe" : "/bin/bash");
  const sessionCwd = cwd || process.cwd();

  const p = pty.spawn(shell, [], {
    name: "xterm-256color",
    cols: 120,
    rows: 30,
    cwd: sessionCwd,
    env: { ...process.env },
  });

  const session = {
    pty: p,
    buffer: [],
    cwd: sessionCwd,
    command: shell,
    createdAt: Date.now(),
  };

  p.onData((data) => {
    // Append to scrollback buffer (line-based)
    const lines = data.split("\n");
    for (const line of lines) {
      session.buffer.push(line);
    }
    // Trim buffer
    if (session.buffer.length > SCROLLBACK_LIMIT) {
      session.buffer = session.buffer.slice(-SCROLLBACK_LIMIT);
    }
    // Notify renderer
    if (outputCallback) outputCallback(name, data);
    // Notify WebSocket clients
    broadcastOutput(name, data);
  });

  p.onExit(({ exitCode }) => {
    log(`Session "${name}" exited with code ${exitCode}`);
    sessions.delete(name);
    if (outputCallback) outputCallback(name, `\r\n[Process exited with code ${exitCode}]\r\n`);
    broadcastEvent({ type: "session_exited", name, exitCode });
  });

  sessions.set(name, session);
  log(`Created session "${name}" (${shell} in ${sessionCwd})`);
  return { ok: true, name };
}

function sendInput(name, text) {
  const session = sessions.get(name);
  if (!session) return { error: `Session "${name}" not found` };
  session.pty.write(text);
  return { ok: true };
}

function readOutput(name, lines) {
  const session = sessions.get(name);
  if (!session) return { error: `Session "${name}" not found` };
  const n = lines || 50;
  const output = session.buffer.slice(-n).join("\n");
  return { ok: true, output };
}

function killSession(name) {
  const session = sessions.get(name);
  if (!session) return { error: `Session "${name}" not found` };
  session.pty.kill();
  sessions.delete(name);
  log(`Killed session "${name}"`);
  return { ok: true };
}

function listSessions() {
  const list = [];
  for (const [name, s] of sessions) {
    list.push({
      name,
      cwd: s.cwd,
      command: s.command,
      createdAt: s.createdAt,
      bufferLines: s.buffer.length,
    });
  }
  return { ok: true, sessions: list };
}

function resizeSession(name, cols, rows) {
  const session = sessions.get(name);
  if (!session) return { error: `Session "${name}" not found` };
  session.pty.resize(cols, rows);
  return { ok: true };
}

// --- WebSocket server for MCP server communication ---

function broadcastOutput(name, data) {
  if (!wss) return;
  const msg = JSON.stringify({ type: "output", name, data });
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

function broadcastEvent(event) {
  if (!wss) return;
  const msg = JSON.stringify(event);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

function startServer() {
  return new Promise((resolve) => {
    wss = new WebSocket.Server({ port: 0, host: "127.0.0.1" }, () => {
      wssPort = wss.address().port;
      log(`WebSocket server listening on 127.0.0.1:${wssPort}`);
      resolve(wssPort);
    });

    wss.on("connection", (ws) => {
      log("MCP server connected via WebSocket");

      ws.on("message", (raw) => {
        let msg;
        try { msg = JSON.parse(raw); } catch { return; }

        let result;
        switch (msg.action) {
          case "create_session":
            result = createSession(msg.params || {});
            break;
          case "send_input":
            result = sendInput(msg.params?.name, msg.params?.text);
            break;
          case "read_output":
            result = readOutput(msg.params?.name, msg.params?.lines);
            break;
          case "kill_session":
            result = killSession(msg.params?.name);
            break;
          case "list_sessions":
            result = listSessions();
            break;
          case "resize":
            result = resizeSession(msg.params?.name, msg.params?.cols, msg.params?.rows);
            break;
          default:
            result = { error: `Unknown action: ${msg.action}` };
        }

        ws.send(JSON.stringify({ id: msg.id, result }));
      });
    });
  });
}

function stopServer() {
  for (const [name] of sessions) {
    killSession(name);
  }
  if (wss) {
    wss.close();
    wss = null;
    wssPort = null;
  }
}

function getPort() {
  return wssPort;
}

function setOutputCallback(cb) {
  outputCallback = cb;
}

// Get metadata for persistence
function getSessionMetadata() {
  const meta = [];
  for (const [name, s] of sessions) {
    meta.push({ name, cwd: s.cwd, command: s.command });
  }
  return meta;
}

module.exports = {
  createSession,
  sendInput,
  readOutput,
  killSession,
  listSessions,
  resizeSession,
  startServer,
  stopServer,
  getPort,
  setOutputCallback,
  getSessionMetadata,
};
```

**Step 2: Verify file is syntactically valid**

```bash
node -c electron/terminal-manager.cjs
```

Expected: No syntax errors.

**Step 3: Commit**

```bash
git add electron/terminal-manager.cjs
git commit -m "feat: add terminal session manager with node-pty and WebSocket server"
```

---

### Task 3: MCP server for Claude

**Files:**
- Create: `electron/mcp-terminal-server.cjs`

A stdio-based MCP server that Claude connects to. It proxies tool calls to the terminal manager via WebSocket.

**Step 1: Write `electron/mcp-terminal-server.cjs`**

```javascript
#!/usr/bin/env node

// MCP server for terminal sessions — stdio transport.
// Launched by Electron with the WebSocket port as argv[2].

const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const WebSocket = require("ws");

const WS_PORT = parseInt(process.argv[2], 10);
if (!WS_PORT) {
  console.error("Usage: mcp-terminal-server.cjs <ws-port>");
  process.exit(1);
}

let ws = null;
let requestId = 0;
const pending = new Map(); // id -> { resolve, reject }

function connect() {
  return new Promise((resolve, reject) => {
    ws = new WebSocket(`ws://127.0.0.1:${WS_PORT}`);
    ws.on("open", () => resolve());
    ws.on("error", (err) => reject(err));
    ws.on("message", (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }
      if (msg.id !== undefined && pending.has(msg.id)) {
        pending.get(msg.id).resolve(msg.result);
        pending.delete(msg.id);
      }
    });
    ws.on("close", () => {
      // Reject all pending
      for (const [id, p] of pending) {
        p.reject(new Error("WebSocket closed"));
      }
      pending.clear();
    });
  });
}

function call(action, params) {
  return new Promise((resolve, reject) => {
    const id = ++requestId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, action, params }));
    // Timeout after 10s
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error("Timeout"));
      }
    }, 10000);
  });
}

async function main() {
  await connect();

  const server = new Server(
    { name: "terminal-sessions", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler("tools/list", async () => ({
    tools: [
      {
        name: "create_session",
        description: "Create a new persistent terminal session. Use this instead of the Bash tool when you need to: run long-lived processes (dev servers, watchers), interact with prompts that need stdin input, or keep a shell alive across multiple turns.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Unique name for this session (e.g. 'dev-server', 'repl')" },
            command: { type: "string", description: "Shell or command to run (default: user's login shell)" },
            cwd: { type: "string", description: "Working directory (default: current project directory)" },
          },
          required: ["name"],
        },
      },
      {
        name: "send_input",
        description: "Send text/keystrokes to a terminal session's stdin. Use \\n for Enter, \\x03 for Ctrl+C, \\x04 for Ctrl+D.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Session name" },
            text: { type: "string", description: "Text to send (supports escape sequences)" },
          },
          required: ["name", "text"],
        },
      },
      {
        name: "read_output",
        description: "Read recent output from a terminal session's scrollback buffer.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Session name" },
            lines: { type: "number", description: "Number of recent lines to return (default: 50)" },
          },
          required: ["name"],
        },
      },
      {
        name: "kill_session",
        description: "Kill a terminal session and its process.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Session name" },
          },
          required: ["name"],
        },
      },
      {
        name: "list_sessions",
        description: "List all active terminal sessions with their status.",
        inputSchema: { type: "object", properties: {} },
      },
    ],
  }));

  server.setRequestHandler("tools/call", async (request) => {
    const { name, arguments: args } = request.params;
    let result;

    try {
      switch (name) {
        case "create_session":
          result = await call("create_session", args);
          break;
        case "send_input":
          result = await call("send_input", args);
          break;
        case "read_output":
          result = await call("read_output", args);
          break;
        case "kill_session":
          result = await call("kill_session", args);
          break;
        case "list_sessions":
          result = await call("list_sessions", args);
          break;
        default:
          result = { error: `Unknown tool: ${name}` };
      }
    } catch (err) {
      result = { error: err.message };
    }

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("MCP server failed:", err);
  process.exit(1);
});
```

**Step 2: Verify syntax**

```bash
node -c electron/mcp-terminal-server.cjs
```

**Step 3: Commit**

```bash
git add electron/mcp-terminal-server.cjs
git commit -m "feat: add MCP server for terminal session tool calls"
```

---

### Task 4: Integrate terminal manager into Electron main process

**Files:**
- Modify: `electron/main.cjs`

Start the terminal manager's WebSocket server on app launch. Write a temporary MCP config file pointing to the MCP server script. Add IPC handlers for terminal operations from the renderer. Forward PTY output to the renderer via IPC.

**Step 1: Add terminal manager imports and startup to `electron/main.cjs`**

At the top of `main.cjs`, after existing requires:
```javascript
const terminalManager = require("./terminal-manager.cjs");
```

In `app.whenReady().then(...)`, after `createWindow()`:
```javascript
  // Start terminal session WebSocket server
  terminalManager.startServer().then((port) => {
    console.log("[main] Terminal WebSocket server on port", port);
    // Write MCP config for claude CLI
    const mcpConfig = {
      mcpServers: {
        "terminal-sessions": {
          command: "node",
          args: [path.join(__dirname, "mcp-terminal-server.cjs"), String(port)],
        },
      },
    };
    const mcpConfigPath = path.join(app.getPath("userData"), "mcp-terminal.json");
    fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));
    global.mcpConfigPath = mcpConfigPath;
  });

  // Forward terminal output to renderer
  terminalManager.setOutputCallback((name, data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("terminal-output", { name, data });
    }
  });
```

**Step 2: Add IPC handlers for terminal operations**

Add before the `app.on("before-quit", ...)` line:
```javascript
// IPC: terminal sessions
ipcMain.handle("terminal-create", async (_event, opts) => {
  return terminalManager.createSession(opts);
});

ipcMain.handle("terminal-send", async (_event, { name, text }) => {
  return terminalManager.sendInput(name, text);
});

ipcMain.handle("terminal-read", async (_event, { name, lines }) => {
  return terminalManager.readOutput(name, lines);
});

ipcMain.handle("terminal-kill", async (_event, { name }) => {
  return terminalManager.killSession(name);
});

ipcMain.handle("terminal-list", async () => {
  return terminalManager.listSessions();
});

ipcMain.handle("terminal-resize", async (_event, { name, cols, rows }) => {
  return terminalManager.resizeSession(name, cols, rows);
});

ipcMain.handle("terminal-metadata", async () => {
  return terminalManager.getSessionMetadata();
});
```

**Step 3: Update `before-quit` handler**

Change `app.on("before-quit", ...)` to also stop terminal server:
```javascript
app.on("before-quit", () => {
  cancelAll();
  terminalManager.stopServer();
});
```

**Step 4: Pass MCP config to agent-manager**

This is done in agent-manager.cjs (Task 5). Here we just need `global.mcpConfigPath` to be accessible.

**Step 5: Commit**

```bash
git add electron/main.cjs
git commit -m "feat: integrate terminal manager into Electron main process"
```

---

### Task 5: Pass MCP config to Claude CLI

**Files:**
- Modify: `electron/agent-manager.cjs`

**Step 1: Add `--mcp-config` flag to Claude spawn args**

In `startAgent()`, after building the `args` array (around line 15), add:
```javascript
  // Attach terminal session MCP server
  if (global.mcpConfigPath) {
    const fs = require("fs");
    if (fs.existsSync(global.mcpConfigPath)) {
      args.push("--mcp-config", global.mcpConfigPath);
    }
  }
```

This goes right before the `if (model)` line.

**Step 2: Verify by running the app**

```bash
npm run dev:electron
```

Check Electron console logs for: `[terminal-manager] WebSocket server listening on 127.0.0.1:XXXXX`

**Step 3: Commit**

```bash
git add electron/agent-manager.cjs
git commit -m "feat: pass MCP terminal config to Claude CLI"
```

---

### Task 6: Expose terminal IPC in preload

**Files:**
- Modify: `electron/preload.cjs`

**Step 1: Add terminal methods to the `api` object**

Add inside the `contextBridge.exposeInMainWorld("api", { ... })` block:
```javascript
  // Terminal sessions
  terminalCreate: (opts) => ipcRenderer.invoke("terminal-create", opts),
  terminalSend: ({ name, text }) => ipcRenderer.invoke("terminal-send", { name, text }),
  terminalRead: ({ name, lines }) => ipcRenderer.invoke("terminal-read", { name, lines }),
  terminalKill: ({ name }) => ipcRenderer.invoke("terminal-kill", { name }),
  terminalList: () => ipcRenderer.invoke("terminal-list"),
  terminalResize: ({ name, cols, rows }) => ipcRenderer.invoke("terminal-resize", { name, cols, rows }),
  terminalMetadata: () => ipcRenderer.invoke("terminal-metadata"),
  onTerminalOutput: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on("terminal-output", handler);
    return () => ipcRenderer.removeListener("terminal-output", handler);
  },
```

**Step 2: Commit**

```bash
git add electron/preload.cjs
git commit -m "feat: expose terminal session IPC in preload"
```

---

### Task 7: React hook for terminal state

**Files:**
- Create: `src/hooks/useTerminal.js`

**Step 1: Write `src/hooks/useTerminal.js`**

```javascript
import { useState, useCallback, useEffect, useRef } from "react";

export default function useTerminal() {
  const [sessions, setSessions] = useState([]); // [{ name, cwd, command, createdAt }]
  const [activeSession, setActiveSession] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const terminalRefs = useRef(new Map()); // name -> xterm.Terminal instance

  // Listen for terminal output from main process
  useEffect(() => {
    if (!window.api?.onTerminalOutput) return;
    const off = window.api.onTerminalOutput(({ name, data }) => {
      const term = terminalRefs.current.get(name);
      if (term) term.write(data);
    });
    return off;
  }, []);

  // Refresh session list
  const refreshSessions = useCallback(async () => {
    if (!window.api?.terminalList) return;
    const result = await window.api.terminalList();
    if (result?.sessions) {
      setSessions(result.sessions);
      // If active session was killed, switch to another
      if (activeSession && !result.sessions.find(s => s.name === activeSession)) {
        setActiveSession(result.sessions[0]?.name || null);
      }
    }
  }, [activeSession]);

  const createSession = useCallback(async ({ name, command, cwd }) => {
    if (!window.api?.terminalCreate) return;
    const result = await window.api.terminalCreate({ name, command, cwd });
    if (result?.ok) {
      await refreshSessions();
      setActiveSession(name);
      setDrawerOpen(true);
    }
    return result;
  }, [refreshSessions]);

  const sendInput = useCallback(async (name, text) => {
    if (!window.api?.terminalSend) return;
    return window.api.terminalSend({ name, text });
  }, []);

  const killSession = useCallback(async (name) => {
    if (!window.api?.terminalKill) return;
    const result = await window.api.terminalKill({ name });
    if (result?.ok) {
      terminalRefs.current.delete(name);
      await refreshSessions();
    }
    return result;
  }, [refreshSessions]);

  const resizeSession = useCallback(async (name, cols, rows) => {
    if (!window.api?.terminalResize) return;
    return window.api.terminalResize({ name, cols, rows });
  }, []);

  const registerTerminal = useCallback((name, terminal) => {
    terminalRefs.current.set(name, terminal);
  }, []);

  const unregisterTerminal = useCallback((name) => {
    terminalRefs.current.delete(name);
  }, []);

  return {
    sessions,
    activeSession,
    setActiveSession,
    drawerOpen,
    setDrawerOpen,
    createSession,
    sendInput,
    killSession,
    resizeSession,
    refreshSessions,
    registerTerminal,
    unregisterTerminal,
  };
}
```

**Step 2: Commit**

```bash
git add src/hooks/useTerminal.js
git commit -m "feat: add useTerminal React hook for terminal session state"
```

---

### Task 8: Terminal drawer UI component

**Files:**
- Create: `src/components/TerminalDrawer.jsx`

This is the right-side drawer containing terminal tabs and the xterm.js renderer.

**Step 1: Write `src/components/TerminalDrawer.jsx`**

```jsx
import { useEffect, useRef, useCallback } from "react";
import { X, Plus, Terminal as TerminalIcon } from "lucide-react";

export default function TerminalDrawer({
  sessions,
  activeSession,
  onSelectSession,
  onCreateSession,
  onKillSession,
  onSendInput,
  onResizeSession,
  drawerOpen,
  onToggleDrawer,
  registerTerminal,
  unregisterTerminal,
}) {
  const containerRef = useRef(null);
  const termRef = useRef(null);       // current xterm.Terminal instance
  const fitAddonRef = useRef(null);
  const xtermElRef = useRef(null);     // DOM element for xterm

  // Initialize / swap xterm when active session changes
  useEffect(() => {
    if (!drawerOpen || !activeSession || !xtermElRef.current) return;

    // Dynamic import since xterm is a browser-only module
    let cancelled = false;

    (async () => {
      const { Terminal } = await import("xterm");
      const { FitAddon } = await import("xterm-addon-fit");
      // Import xterm CSS
      await import("xterm/css/xterm.css");

      if (cancelled) return;

      // Clean up previous terminal
      if (termRef.current) {
        termRef.current.dispose();
      }

      const term = new Terminal({
        theme: {
          background: "#0a0a0a",
          foreground: "rgba(255,255,255,0.82)",
          cursor: "rgba(255,255,255,0.6)",
          selectionBackground: "rgba(255,255,255,0.15)",
        },
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        fontSize: 13,
        lineHeight: 1.4,
        cursorBlink: true,
        allowTransparency: true,
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(xtermElRef.current);
      fitAddon.fit();

      // Forward user keystrokes to the session
      term.onData((data) => {
        onSendInput(activeSession, data);
      });

      // Notify main process of new size
      term.onResize(({ cols, rows }) => {
        onResizeSession(activeSession, cols, rows);
      });

      termRef.current = term;
      fitAddonRef.current = fitAddon;
      registerTerminal(activeSession, term);

      // Load existing scrollback
      if (window.api?.terminalRead) {
        const result = await window.api.terminalRead({ name: activeSession, lines: 500 });
        if (result?.output) {
          term.write(result.output);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeSession, drawerOpen]);

  // Handle resize
  useEffect(() => {
    if (!drawerOpen || !fitAddonRef.current) return;
    const observer = new ResizeObserver(() => {
      try { fitAddonRef.current?.fit(); } catch {}
    });
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [drawerOpen, activeSession]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (termRef.current) {
        if (activeSession) unregisterTerminal(activeSession);
        termRef.current.dispose();
      }
    };
  }, []);

  const handleNewSession = () => {
    const name = `shell-${Date.now()}`;
    onCreateSession({ name });
  };

  if (!drawerOpen) return null;

  return (
    <div
      ref={containerRef}
      style={{
        width: 480,
        minWidth: 480,
        borderLeft: "1px solid rgba(255,255,255,0.025)",
        display: "flex",
        flexDirection: "column",
        background: "rgba(0,0,0,0.85)",
        backdropFilter: "blur(56px) saturate(1.1)",
        position: "relative",
        zIndex: 10,
      }}
    >
      {/* Header */}
      <div style={{
        height: 52,
        display: "flex",
        alignItems: "flex-end",
        padding: "0 12px 8px",
        gap: 8,
        borderBottom: "1px solid rgba(255,255,255,0.04)",
        WebkitAppRegion: "drag",
      }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          flex: 1,
          overflow: "hidden",
          WebkitAppRegion: "no-drag",
        }}>
          <TerminalIcon size={13} style={{ color: "rgba(255,255,255,0.35)", flexShrink: 0 }} />
          <span style={{
            fontSize: 10,
            fontFamily: "'JetBrains Mono',monospace",
            color: "rgba(255,255,255,0.35)",
            letterSpacing: ".08em",
          }}>
            TERMINALS
          </span>
        </div>
        <div style={{ display: "flex", gap: 4, WebkitAppRegion: "no-drag" }}>
          <button
            onClick={handleNewSession}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 24, height: 24, borderRadius: 6,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.06)",
              color: "rgba(255,255,255,0.4)", cursor: "pointer",
            }}
          >
            <Plus size={12} />
          </button>
          <button
            onClick={onToggleDrawer}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 24, height: 24, borderRadius: 6,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.06)",
              color: "rgba(255,255,255,0.4)", cursor: "pointer",
            }}
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      {sessions.length > 1 && (
        <div style={{
          display: "flex",
          gap: 2,
          padding: "6px 8px",
          overflowX: "auto",
          borderBottom: "1px solid rgba(255,255,255,0.03)",
        }}>
          {sessions.map((s) => (
            <button
              key={s.name}
              onClick={() => onSelectSession(s.name)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "4px 10px", borderRadius: 6, border: "none",
                background: s.name === activeSession ? "rgba(255,255,255,0.08)" : "transparent",
                color: s.name === activeSession ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.3)",
                fontSize: 11, fontFamily: "'JetBrains Mono',monospace",
                cursor: "pointer", whiteSpace: "nowrap",
              }}
            >
              {s.name}
              <span
                onClick={(e) => { e.stopPropagation(); onKillSession(s.name); }}
                style={{ color: "rgba(255,255,255,0.2)", cursor: "pointer" }}
              >
                <X size={10} />
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Terminal viewport */}
      <div
        ref={xtermElRef}
        style={{ flex: 1, padding: "8px 4px", overflow: "hidden" }}
      />

      {sessions.length === 0 && (
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexDirection: "column", gap: 12,
        }}>
          <TerminalIcon size={32} style={{ color: "rgba(255,255,255,0.08)" }} />
          <span style={{
            fontSize: 11, color: "rgba(255,255,255,0.2)",
            fontFamily: "system-ui,sans-serif",
          }}>
            No active sessions
          </span>
          <button
            onClick={handleNewSession}
            style={{
              padding: "6px 14px", borderRadius: 8,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "rgba(255,255,255,0.5)",
              fontSize: 12, fontFamily: "system-ui,sans-serif",
              cursor: "pointer",
            }}
          >
            New terminal
          </button>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/TerminalDrawer.jsx
git commit -m "feat: add TerminalDrawer UI component with xterm.js rendering"
```

---

### Task 9: Wire terminal drawer into App layout

**Files:**
- Modify: `src/App.jsx`

**Step 1: Import useTerminal and TerminalDrawer**

At the top of `App.jsx`, add:
```javascript
import useTerminal from "./hooks/useTerminal";
import TerminalDrawer from "./components/TerminalDrawer";
```

**Step 2: Initialize the hook**

Inside the `App()` function, after the `useAgent()` call:
```javascript
const terminal = useTerminal();
```

**Step 3: Add TerminalDrawer to the layout**

In the return JSX, after the `{/* Main chat area */}` ChatArea component, add:
```jsx
      {/* Terminal drawer */}
      <TerminalDrawer
        sessions={terminal.sessions}
        activeSession={terminal.activeSession}
        onSelectSession={terminal.setActiveSession}
        onCreateSession={terminal.createSession}
        onKillSession={terminal.killSession}
        onSendInput={terminal.sendInput}
        onResizeSession={terminal.resizeSession}
        drawerOpen={terminal.drawerOpen}
        onToggleDrawer={() => terminal.setDrawerOpen(o => !o)}
        registerTerminal={terminal.registerTerminal}
        unregisterTerminal={terminal.unregisterTerminal}
      />
```

**Step 4: Refresh sessions on mount**

Add an effect to poll terminal sessions (handles sessions created by Claude):
```javascript
  // Refresh terminal sessions periodically (catches Claude-created sessions)
  useEffect(() => {
    terminal.refreshSessions();
    const interval = setInterval(() => terminal.refreshSessions(), 3000);
    return () => clearInterval(interval);
  }, []);
```

**Step 5: Persist terminal metadata on quit**

In the state-saving effect, include terminal metadata:
```javascript
// Already existing save effect — add terminalMeta to the saved state
```

Actually, the simpler approach: terminal sessions are ephemeral (metadata-only persistence is handled by claudi-state.json). The `refreshSessions` polling handles re-sync. No additional persistence code needed for MVP.

**Step 6: Verify by running**

```bash
npm run dev:electron
```

Expected: App launches. Terminal drawer is hidden by default. Need a way to open it — add a terminal button to the top bar or keyboard shortcut.

**Step 7: Add terminal toggle button to ChatArea**

In `src/components/ChatArea.jsx`, accept a new prop `onToggleTerminal` and add a button in the top bar area. This is optional polish — can also be triggered by Claude creating a session.

For now, pass the toggle through:

In `App.jsx`, pass to ChatArea:
```jsx
<ChatArea
  {...existingProps}
  onToggleTerminal={() => terminal.setDrawerOpen(o => !o)}
  terminalOpen={terminal.drawerOpen}
  terminalCount={terminal.sessions.length}
/>
```

In `ChatArea.jsx`, add a terminal button next to the model picker:
```jsx
{onToggleTerminal && (
  <button onClick={onToggleTerminal} style={{/* terminal icon button styles */}}>
    <TerminalIcon size={14} />
    {terminalCount > 0 && <span>{terminalCount}</span>}
  </button>
)}
```

**Step 8: Commit**

```bash
git add src/App.jsx src/components/ChatArea.jsx
git commit -m "feat: wire terminal drawer into app layout with toggle button"
```

---

### Task 10: Session persistence (metadata-only)

**Files:**
- Modify: `electron/main.cjs`
- Modify: `src/App.jsx`

**Step 1: Save terminal metadata on quit**

In `main.cjs`, in the `before-quit` handler:
```javascript
app.on("before-quit", () => {
  // Save terminal session metadata for re-launch
  const meta = terminalManager.getSessionMetadata();
  if (meta.length > 0) {
    const metaPath = path.join(app.getPath("userData"), "terminal-sessions.json");
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  }
  cancelAll();
  terminalManager.stopServer();
});
```

**Step 2: Add IPC handler to load saved metadata**

```javascript
ipcMain.handle("terminal-saved-metadata", async () => {
  const metaPath = path.join(app.getPath("userData"), "terminal-sessions.json");
  try {
    if (fs.existsSync(metaPath)) {
      const data = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
      // Clear the file after reading (one-shot restore)
      fs.unlinkSync(metaPath);
      return data;
    }
  } catch {}
  return [];
});
```

**Step 3: Add preload method**

In `preload.cjs`:
```javascript
terminalSavedMetadata: () => ipcRenderer.invoke("terminal-saved-metadata"),
```

**Step 4: Prompt user to restore sessions on launch**

In `useTerminal.js`, add a restore-on-mount effect that checks for saved metadata and offers to relaunch. For MVP, just auto-restore silently.

**Step 5: Commit**

```bash
git add electron/main.cjs electron/preload.cjs src/hooks/useTerminal.js
git commit -m "feat: save and restore terminal session metadata across restarts"
```

---

### Task 11: End-to-end manual test

**Step 1: Launch the app**

```bash
npm run dev:electron
```

**Step 2: Verify terminal drawer**

- Click the terminal button in the top bar → drawer opens on the right
- Click "+" or "New terminal" → a shell session spawns
- Type `ls` + Enter → output appears in xterm.js
- Type `echo hello` → works
- Open a second session → tabs appear

**Step 3: Verify Claude can use terminal tools**

- Start a chat, ask Claude: "Create a terminal session called 'test' and run `echo hello world` in it"
- Claude should use the `create_session` and `send_input` MCP tools
- The terminal drawer should open showing the session
- Claude should use `read_output` to see the result

**Step 4: Verify interactive use case**

- Ask Claude: "Start a Python REPL in a terminal session and print 1+1"
- Claude should create a session, send `python3\n`, wait, send `print(1+1)\n`, read output

**Step 5: Test session persistence**

- Create a terminal session
- Quit and relaunch the app
- Verify it offers to restore the session

---

### Task 12: Add xterm.css to Vite build

**Files:**
- Modify: `vite.config.js` (if needed)

xterm.js CSS is imported dynamically in TerminalDrawer. Vite should handle this via the dynamic `import("xterm/css/xterm.css")` call. If it doesn't work in production build, add a static import in `src/main.jsx`:

```javascript
import "xterm/css/xterm.css";
```

Verify with `npm run build` that the CSS is bundled.

**Step 1: Build and verify**

```bash
npm run build
```

**Step 2: Commit if changes needed**

```bash
git add vite.config.js src/main.jsx
git commit -m "fix: ensure xterm.css is bundled in production build"
```
