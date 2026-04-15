# Codex (GPT-5.4) Provider Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add OpenAI Codex CLI as a second provider alongside Claude Code, supporting GPT-5.4 with medium/high/xhigh reasoning effort levels.

**Architecture:** Provider-per-conversation model. Each conversation is bound to either Claude or Codex at creation time. The agent-manager routes to the correct CLI binary based on the model's `provider` field. The `useAgent` hook normalizes both stream formats into the same `parts[]` structure so the UI layer is provider-agnostic. Session resume uses provider-specific commands (Claude: `--resume <id>`, Codex: `exec resume <id> "prompt"`).

**Tech Stack:** Electron (main process spawns CLI), React (renderer), existing IPC bridge unchanged.

**Key constraints discovered during research:**
- Codex `exec` defaults to `read-only` sandbox -- must pass `--full-auto` for workspace-write
- Codex `--json` sends complete items (no incremental text deltas) -- text appears all at once per item
- Codex uses `thread_id` (from `thread.started` event) for session resume, not a pre-generated UUID
- Codex resume is a subcommand: `codex exec resume <thread_id> "prompt"`, not a flag
- Codex images use native `-i <file>` flag (simpler than Claude's approach)
- Codex tool calls appear as `command_execution` items, not `tool_use`/`tool_result`

---

### Task 1: Update model definitions

**Files:**
- Modify: `src/data/models.js`

**Step 1: Add provider field and Codex models**

```js
export const MODELS = [
  { id: "opus",   name: "Claude Opus",   tag: "OPUS",   cliFlag: "opus",   provider: "claude" },
  { id: "sonnet", name: "Claude Sonnet", tag: "SONNET", cliFlag: "sonnet", provider: "claude" },
  { id: "haiku",  name: "Claude Haiku",  tag: "HAIKU",  cliFlag: "haiku",  provider: "claude" },
  { id: "gpt54-med",   name: "GPT-5.4",        tag: "GPT-5.4",       cliFlag: "gpt-5.4", provider: "codex", effort: "medium" },
  { id: "gpt54-high",  name: "GPT-5.4 High",   tag: "GPT-5.4 HIGH",  cliFlag: "gpt-5.4", provider: "codex", effort: "high" },
  { id: "gpt54-xhigh", name: "GPT-5.4 XHigh",  tag: "GPT-5.4 XHIGH", cliFlag: "gpt-5.4", provider: "codex", effort: "xhigh" },
];

export const getM = (id) => MODELS.find((m) => m.id === id) || MODELS[0];
```

**Step 2: Verify nothing breaks**

Run: `cd /Users/kira-chan/Downloads/Ensue-Chat && npx vite build 2>&1 | tail -5`
Expected: Build succeeds (no import errors).

**Step 3: Commit**

```bash
git add src/data/models.js
git commit -m "feat: add GPT-5.4 model definitions with provider field"
```

---

### Task 2: Create Codex agent manager

**Files:**
- Create: `electron/codex-agent-manager.cjs`

This module mirrors the structure of `electron/agent-manager.cjs` but spawns `codex exec` instead of `claude`.

**Step 1: Write the codex agent manager**

```js
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

  const codexBin = resolveCodexBin();
  if (!codexBin) {
    const error = "Unable to locate the Codex CLI binary. Install with: brew install codex";
    log(error);
    webContents.send("agent-error", { conversationId, error });
    webContents.send("agent-done", { conversationId, exitCode: -1 });
    return null;
  }

  // Build args: either "exec resume <id> <prompt>" or "exec <prompt>"
  const args = ["exec"];

  if (resumeSessionId) {
    args.push("resume", resumeSessionId);
  }

  args.push("--json", "--full-auto");

  if (model) args.push("-m", model);
  if (effort) args.push("-c", `model_reasoning_effort="${effort}"`);

  // Set working directory
  if (cwd && isDirectory(cwd)) {
    args.push("-C", cwd);
  }

  // Attach images natively
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

  // Prompt goes last
  args.push(prompt);

  log("Starting codex agent:", { conversationId, model, effort, cwd, resumeSessionId });
  log("Full args:", args.filter(a => a !== prompt).join(" "));

  const child = spawn(codexBin, args, {
    cwd: cwd || process.cwd(),
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
```

**Step 2: Verify it loads**

Run: `node -e "require('./electron/codex-agent-manager.cjs'); console.log('OK')"`
Expected: `OK`

**Step 3: Commit**

```bash
git add electron/codex-agent-manager.cjs
git commit -m "feat: add codex agent manager for GPT-5.4 CLI integration"
```

---

### Task 3: Route IPC to correct agent manager

**Files:**
- Modify: `electron/main.cjs:1-8` (imports)
- Modify: `electron/main.cjs:196-211` (IPC handlers)

**Step 1: Add codex import to main.cjs**

At the top of `main.cjs`, after line 5, add the codex import:

```js
const { startCodexAgent, cancelCodexAgent, cancelAllCodex } = require("./codex-agent-manager.cjs");
```

**Step 2: Update `agent-start` IPC handler**

Replace the `agent-start` handler at line 197-199 with routing logic. The `opts` object already carries `model` (the cliFlag string). We need to also pass the `provider` and `effort` fields. The renderer will send these as part of `opts`.

```js
// IPC: agent
ipcMain.on("agent-start", (event, opts) => {
  if (opts.provider === "codex") {
    startCodexAgent(opts, event.sender);
  } else {
    startAgent(opts, event.sender);
  }
});
```

**Step 3: Update `agent-cancel` IPC handler**

Replace line 201-203. Since we don't know which manager owns the agent, cancel on both:

```js
ipcMain.on("agent-cancel", (_event, { conversationId }) => {
  cancelAgent(conversationId);
  cancelCodexAgent(conversationId);
});
```

**Step 4: Update `agent-edit-resend` IPC handler**

Replace line 205-207:

```js
ipcMain.on("agent-edit-resend", (event, opts) => {
  if (opts.provider === "codex") {
    // Codex doesn't have fork-session; resume with the thread_id is the equivalent
    startCodexAgent({ ...opts, resumeSessionId: opts.resumeSessionId }, event.sender);
  } else {
    startAgent({ ...opts, forkSession: true }, event.sender);
  }
});
```

**Step 5: Update app quit cleanup**

Find where `cancelAll()` is called (in the `window-all-closed` or `before-quit` handler) and add `cancelAllCodex()`.

**Step 6: Verify build**

Run: `cd /Users/kira-chan/Downloads/Ensue-Chat && npx vite build 2>&1 | tail -5`
Expected: Build succeeds.

**Step 7: Commit**

```bash
git add electron/main.cjs
git commit -m "feat: route agent IPC to claude or codex based on provider"
```

---

### Task 4: Normalize Codex stream events in useAgent

**Files:**
- Modify: `src/hooks/useAgent.js:67-234` (inside the `onAgentStream` callback)

The key mapping from Codex events to the existing `parts[]` structure:

| Codex event | Action |
|------------|--------|
| `thread.started` | Store `thread_id` for session resume |
| `turn.started` | Ensure assistant message exists |
| `item.completed` + `type: "agent_message"` | Add `{ type: "text", text }` part |
| `item.started` + `type: "command_execution"` | Add `{ type: "tool", name: cmd, status: "running" }` part |
| `item.completed` + `type: "command_execution"` | Update tool part with result + status: "done" |
| `turn.completed` | Mark assistant as done streaming |

**Step 1: Add Codex event handling branch**

Inside the `onAgentStream` callback (after the existing `if (event.type === "stream_event")` block at line 67), add an else-if chain for Codex events. The Codex events use different top-level `type` values (`thread.started`, `turn.started`, `item.completed`, etc.) so they won't collide with Claude's events.

Add this after the closing `}` of the `if (event.type === "result")` block (around line 234), but before `next.set(conversationId, ...)`:

```js
// ── Codex event handling ──
else if (event.type === "thread.started") {
  // Store thread_id on the conversation for session resume
  const threadId = event.thread_id;
  if (threadId) {
    convo._codexThreadId = threadId;
  }
}
else if (event.type === "turn.started") {
  ensureAssistant();
}
else if (event.type === "item.started") {
  const item = event.item;
  if (item?.type === "command_execution") {
    ensureAssistant();
    const parts = cloneParts(lastMsg.parts);
    parts.push({
      type: "tool",
      id: item.id || "codex-" + uid(),
      name: item.command || "command",
      args: { command: item.command },
      result: null,
      status: "running",
    });
    const merged = { ...lastMsg, parts };
    msgs[msgs.length - 1] = merged;
    lastMsg = merged;
  }
}
else if (event.type === "item.completed") {
  const item = event.item;
  if (item?.type === "agent_message" && item.text) {
    ensureAssistant();
    const parts = cloneParts(lastMsg.parts);
    parts.push({ type: "text", text: item.text });
    const merged = { ...lastMsg, parts };
    msgs[msgs.length - 1] = merged;
    lastMsg = merged;
  }
  else if (item?.type === "command_execution") {
    ensureAssistant();
    const parts = cloneParts(lastMsg.parts);
    // Find the matching in-progress tool part
    const toolIdx = parts.findIndex(p => p.type === "tool" && p.id === item.id);
    if (toolIdx >= 0) {
      parts[toolIdx] = {
        ...parts[toolIdx],
        result: item.aggregated_output || `exit code: ${item.exit_code}`,
        status: "done",
      };
    } else {
      // No matching item.started was seen — add complete tool part
      parts.push({
        type: "tool",
        id: item.id || "codex-" + uid(),
        name: item.command || "command",
        args: { command: item.command },
        result: item.aggregated_output || `exit code: ${item.exit_code}`,
        status: "done",
      });
    }
    const merged = { ...lastMsg, parts };
    msgs[msgs.length - 1] = merged;
    lastMsg = merged;
  }
}
else if (event.type === "turn.completed") {
  if (lastMsg && lastMsg.role === "assistant") {
    msgs[msgs.length - 1] = { ...lastMsg, isStreaming: false, isThinking: false };
  }
}
```

**Step 2: Verify build**

Run: `cd /Users/kira-chan/Downloads/Ensue-Chat && npx vite build 2>&1 | tail -5`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/hooks/useAgent.js
git commit -m "feat: normalize codex stream events into parts[] format"
```

---

### Task 5: Pass provider and effort through the send flow

**Files:**
- Modify: `src/App.jsx:249-260` (in `handleSend`)

**Step 1: Update sendMessage call to include provider and effort**

The `getM()` call at line 249 already returns the full model object. We need to pass `provider` and `effort` through to the IPC layer.

Replace lines 249-260:

```js
      const m = getM(convo.model);

      sendMessage({
        conversationId: convoId,
        sessionId: isFirstMessage ? convo.sessionId : undefined,
        resumeSessionId: isFirstMessage ? undefined : convo.sessionId,
        prompt: text,
        model: m.cliFlag,
        provider: m.provider || "claude",
        effort: m.effort,
        cwd: effectiveCwd,
        images: images?.length ? images : undefined,
        files: files?.length ? files : undefined,
      });
```

**Step 2: Handle Codex thread_id for session resume**

For Codex, the `sessionId` for resume is the `thread_id` returned by the `thread.started` event, not the pre-generated UUID. We need to capture it.

In `App.jsx`, after the `sendMessage` call, we need to watch for the `_codexThreadId` from `useAgent` and store it on the conversation. This is tricky because the thread_id arrives asynchronously.

Better approach: store the thread_id in the conversation when we receive it. Add an effect that watches for it:

After the existing `useEffect` that handles state loading, add:

```js
  // Capture Codex thread_id for session resume
  useEffect(() => {
    if (!active) return;
    const data = getConversation(active);
    if (data._codexThreadId) {
      const convo = convoList.find(c => c.id === active);
      if (convo && convo.sessionId !== data._codexThreadId) {
        setConvoList((p) =>
          p.map((c) => c.id === active ? { ...c, sessionId: data._codexThreadId } : c)
        );
      }
    }
  }, [active, conversations]);
```

**Step 3: Update editAndResend to pass provider**

Find the `handleEdit` callback. It calls `editAndResend()`. Ensure it passes `provider` and `effort`:

```js
  const handleEdit = useCallback(
    async (messageIndex, newText) => {
      // ... existing checkpoint logic ...
      const m = getM(activeConvo.model);
      editAndResend({
        conversationId: active,
        sessionId: activeConvo.sessionId,
        messageIndex,
        newText,
        model: m.cliFlag,
        provider: m.provider || "claude",
        effort: m.effort,
        cwd: activeConvo.cwd || cwd,
      });
    },
    [active, activeConvo, cwd, editAndResend]
  );
```

**Step 4: Verify build**

Run: `cd /Users/kira-chan/Downloads/Ensue-Chat && npx vite build 2>&1 | tail -5`

**Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "feat: pass provider and effort through send flow for codex routing"
```

---

### Task 6: Update ModelPicker with provider grouping

**Files:**
- Modify: `src/components/ModelPicker.jsx`

**Step 1: Group models by provider in dropdown**

Replace the `MODELS.map()` block inside the dropdown with grouped rendering:

```jsx
{/* Claude models */}
<div style={{ padding: "4px 10px 2px", fontSize: s(8), color: "rgba(255,255,255,0.2)", letterSpacing: ".12em", fontFamily: "'JetBrains Mono',monospace" }}>
  CLAUDE
</div>
{MODELS.filter(mm => mm.provider === "claude").map((mm) => (
  <button
    key={mm.id}
    onClick={() => { onChange(mm.id); set(false); }}
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      width: "100%",
      padding: "9px 13px",
      background: mm.id === value ? "rgba(255,255,255,0.04)" : "transparent",
      border: "none",
      borderRadius: 7,
      color: mm.id === value ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.4)",
      fontSize: s(11),
      fontFamily: "'JetBrains Mono',monospace",
      cursor: "pointer",
      textAlign: "left",
      transition: "all .12s",
    }}
    onMouseEnter={(e) => { if (mm.id !== value) e.currentTarget.style.background = "rgba(255,255,255,0.025)"; }}
    onMouseLeave={(e) => { if (mm.id !== value) e.currentTarget.style.background = "transparent"; }}
  >
    {mm.name}
    <span style={{ fontSize: s(9), opacity: 0.4, letterSpacing: ".1em" }}>{mm.tag}</span>
  </button>
))}

{/* Divider */}
<div style={{ height: 1, background: "rgba(255,255,255,0.04)", margin: "4px 8px" }} />

{/* Codex models */}
<div style={{ padding: "4px 10px 2px", fontSize: s(8), color: "rgba(255,255,255,0.2)", letterSpacing: ".12em", fontFamily: "'JetBrains Mono',monospace" }}>
  CODEX
</div>
{MODELS.filter(mm => mm.provider === "codex").map((mm) => (
  <button
    key={mm.id}
    onClick={() => { onChange(mm.id); set(false); }}
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      width: "100%",
      padding: "9px 13px",
      background: mm.id === value ? "rgba(255,255,255,0.04)" : "transparent",
      border: "none",
      borderRadius: 7,
      color: mm.id === value ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.4)",
      fontSize: s(11),
      fontFamily: "'JetBrains Mono',monospace",
      cursor: "pointer",
      textAlign: "left",
      transition: "all .12s",
    }}
    onMouseEnter={(e) => { if (mm.id !== value) e.currentTarget.style.background = "rgba(255,255,255,0.025)"; }}
    onMouseLeave={(e) => { if (mm.id !== value) e.currentTarget.style.background = "transparent"; }}
  >
    {mm.name}
    <span style={{ fontSize: s(9), opacity: 0.4, letterSpacing: ".1em" }}>{mm.tag}</span>
  </button>
))}
```

**Step 2: Verify build**

Run: `cd /Users/kira-chan/Downloads/Ensue-Chat && npx vite build 2>&1 | tail -5`

**Step 3: Commit**

```bash
git add src/components/ModelPicker.jsx
git commit -m "feat: group model picker by provider (claude/codex)"
```

---

### Task 7: Add Codex session reading to sidebar

**Files:**
- Modify: `electron/session-reader.cjs`

Codex sessions live in `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`. The format is different from Claude's JSONL. We need `listSessions` to also scan Codex session files for the given cwd, and `loadSessionMessages` to parse Codex events.

**Step 1: Add Codex session directory constant**

After line 5 (`const CLAUDE_DIR = ...`), add:

```js
const CODEX_DIR = path.join(os.homedir(), ".codex");
```

**Step 2: Add Codex session listing to `listSessions`**

After the existing Claude session scanning in `listSessions` (before the `sessions.sort` at line 140), add Codex session scanning:

```js
  // Also scan Codex sessions
  const codexSessionsBase = path.join(CODEX_DIR, "sessions");
  if (fs.existsSync(codexSessionsBase)) {
    // Walk YYYY/MM/DD directories
    const walkDir = (dir) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walkDir(fullPath);
          } else if (entry.name.endsWith(".jsonl")) {
            try {
              const content = fs.readFileSync(fullPath, "utf-8");
              const firstLine = content.split("\n").find(l => l.trim());
              if (!firstLine) continue;
              const meta = JSON.parse(firstLine);
              // Only include sessions from matching cwd
              if (meta.type !== "session_meta" || meta.payload?.cwd !== cwd) continue;

              const threadId = meta.payload?.id;
              if (!threadId) continue;
              const stat = fs.statSync(fullPath);

              // Extract title from first user message
              let title = "Untitled";
              const lines = content.split("\n").slice(0, 30);
              for (const line of lines) {
                if (!line.trim()) continue;
                try {
                  const evt = JSON.parse(line);
                  if (evt.type === "response_item" && evt.payload?.role === "user") {
                    const textBlock = evt.payload?.content?.find(b => b.type === "input_text");
                    if (textBlock?.text && !textBlock.text.startsWith("<") && !textBlock.text.startsWith("#")) {
                      title = textBlock.text.slice(0, 60);
                      break;
                    }
                  }
                } catch {}
              }

              sessions.push({
                id: threadId,
                title,
                model: null,
                ts: stat.mtimeMs,
                cwd,
                provider: "codex",
                filePath: fullPath,
              });
            } catch {}
          }
        }
      } catch {}
    };
    walkDir(codexSessionsBase);
  }
```

**Step 3: Add Codex session loading to `loadSessionMessages`**

In `loadSessionMessages`, after the `findSessionFile` check, add a branch for Codex sessions. If `findSessionFile` returns null, try finding the session in Codex's directory:

```js
  // If not a Claude session, try Codex sessions
  if (!found) {
    const codexFile = findCodexSessionFile(sessionId);
    if (codexFile) {
      return loadCodexSessionMessages(codexFile);
    }
    return { messages: [], cwd: null };
  }
```

Add helper functions:

```js
function findCodexSessionFile(threadId) {
  const sessionsDir = path.join(CODEX_DIR, "sessions");
  if (!fs.existsSync(sessionsDir)) return null;

  // Walk YYYY/MM/DD directories looking for matching thread_id
  const walk = (dir) => {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          const result = walk(fullPath);
          if (result) return result;
        } else if (entry.name.endsWith(".jsonl") && entry.name.includes(threadId)) {
          return fullPath;
        }
      }
    } catch {}
    return null;
  };

  return walk(sessionsDir);
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
    }

    // User messages
    if (evt.type === "response_item" && evt.payload?.role === "user") {
      const textBlock = evt.payload?.content?.find(b => b.type === "input_text");
      if (textBlock?.text) {
        let text = textBlock.text;
        // Skip system/skill injections
        if (text.startsWith("<") || text.startsWith("#")) continue;
        messages.push({
          id: "u" + Date.now() + Math.random(),
          role: "user",
          text,
        });
      }
    }

    // Agent messages (completed items from turns)
    if (evt.type === "event_msg" || (evt.type === "response_item" && evt.payload?.type === "message" && evt.payload?.role === "assistant")) {
      const content = evt.payload?.content;
      if (Array.isArray(content)) {
        const parts = [];
        for (const block of content) {
          if (block.type === "output_text" && block.text) {
            parts.push({ type: "text", text: block.text });
          }
        }
        if (parts.length > 0) {
          messages.push({
            id: "a" + Date.now() + Math.random(),
            role: "assistant",
            parts,
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
```

**Step 4: Verify it loads**

Run: `node -e "const r = require('./electron/session-reader.cjs'); console.log('OK')"`
Expected: `OK`

**Step 5: Commit**

```bash
git add electron/session-reader.cjs
git commit -m "feat: add codex session reading for sidebar history"
```

---

### Task 8: End-to-end integration test

**Files:** None (manual testing)

**Step 1: Start the dev server**

Run: `cd /Users/kira-chan/Downloads/Ensue-Chat && npm run dev`

**Step 2: Test Claude flow (regression)**

1. Open the app
2. Select "Claude Sonnet" from model picker
3. Send a message: "What is 2+2?"
4. Verify streaming text appears incrementally
5. Verify tool calls render if triggered

**Step 3: Test Codex flow**

1. Select "GPT-5.4" from model picker
2. Send a message: "List the files in the current directory"
3. Verify text appears (will appear all at once per item)
4. Verify command_execution tool calls show with output

**Step 4: Test session resume for both providers**

1. Send a follow-up message in both Claude and Codex conversations
2. Verify context is maintained (can reference prior messages)

**Step 5: Test model picker UI**

1. Verify CLAUDE and CODEX group headers appear
2. Verify divider between groups
3. Verify all 6 models are selectable

**Step 6: Commit any fixes**

```bash
git add -A
git commit -m "fix: integration test fixes for codex support"
```

---

## Appendix: Codex CLI Cheat Sheet

```bash
# Basic exec with JSON output
codex exec --json --full-auto -m gpt-5.4 -c 'model_reasoning_effort="medium"' "prompt"

# Resume session
codex exec resume --json --full-auto -m gpt-5.4 "<thread_id>" "follow-up prompt"

# With images
codex exec --json --full-auto -m gpt-5.4 -i /path/to/image.png "describe this"

# Ephemeral (no session persistence)
codex exec --json --full-auto --ephemeral -m gpt-5.4 "one-shot prompt"

# With extra writable directories
codex exec --json --full-auto --add-dir /tmp -m gpt-5.4 "prompt"
```

## Appendix: Stream Event Format Reference

```jsonl
{"type":"thread.started","thread_id":"019d8a78-be9d-7512-a573-5de2de0ef55d"}
{"type":"turn.started"}
{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"response text"}}
{"type":"item.started","item":{"id":"item_1","type":"command_execution","command":"/bin/zsh -lc ls","status":"in_progress"}}
{"type":"item.completed","item":{"id":"item_1","type":"command_execution","command":"/bin/zsh -lc ls","aggregated_output":"file1\nfile2\n","exit_code":0,"status":"completed"}}
{"type":"turn.completed","usage":{"input_tokens":12181,"cached_input_tokens":3456,"output_tokens":18}}
```
