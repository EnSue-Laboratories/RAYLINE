# Ensue Chat — Electron Claude Code Wrapper

**Date:** 2026-04-11
**Status:** Approved

## Overview

Convert the existing Ensue Chat React UI into a native Electron desktop app that wraps Claude Code CLI. The app spawns `claude --print --output-format=stream-json` as child processes, parses JSONL stdout, and renders streaming responses with tool call visibility, image/file input, and message editing.

## Architecture

**Approach:** Direct process spawn (same pattern as Inspector).

```
Electron App
├── Main Process (Node.js)
│   ├── main.js          — app entry, window creation, IPC handlers
│   ├── preload.js       — context bridge (window.api)
│   └── agent-manager.js — spawn/kill claude, parse JSONL, track processes
│
└── Renderer (React, existing src/)
    ├── App.jsx
    ├── components/
    │   ├── Sidebar.jsx        — conversation list from Claude Code sessions
    │   ├── ChatArea.jsx       — messages + input, wired to IPC
    │   ├── Message.jsx        — user/assistant bubbles
    │   ├── ToolCallBlock.jsx  — collapsible tool call cards (NEW)
    │   ├── ImagePreview.jsx   — thumbnail/file chip previews (NEW)
    │   ├── EmptyState.jsx
    │   ├── ModelPicker.jsx    — real Claude models (sonnet, opus, haiku)
    │   └── CopyBtn.jsx
    ├── hooks/
    │   └── useAgent.js        — IPC listener, streaming state (NEW)
    └── data/
        └── models.js          — updated to real Claude models
```

## IPC Protocol

### Renderer → Main

| Channel | Payload | Purpose |
|---------|---------|---------|
| `agent-start` | `{ conversationId, prompt, model, cwd, images?, files? }` | Start Claude Code run |
| `agent-cancel` | `{ conversationId }` | Kill child process |
| `folder-pick` | — | Open native folder picker |
| `list-sessions` | `{ cwd }` | List past sessions for a project |

### Main → Renderer

| Channel | Payload | Purpose |
|---------|---------|---------|
| `agent-stream` | `{ conversationId, event }` | Each parsed JSONL event |
| `agent-done` | `{ conversationId, exitCode }` | Process exited |
| `agent-error` | `{ conversationId, error }` | Spawn/parse error |
| `folder-picked` | `{ path }` | Selected folder path |

## Session Persistence

Claude Code handles all persistence. Sessions stored at `~/.claude/projects/{project}/{sessionId}.jsonl`.

- **New chat:** Generate UUID, pass `--session-id=<uuid>`
- **Resume chat:** Pass `--resume=<sessionId>`
- **Sidebar list:** Scan `~/.claude/projects/` for session files + read `~/.claude/history.jsonl` for titles/timestamps

## Message Edit & Rewind

Each user message has an edit button. On edit:

1. Show editable input in the message bubble
2. On submit, fork session: `claude --print --resume <sessionId> --fork-session --output-format=stream-json`
3. Remove all messages after the edited one
4. New Claude run starts with edited text
5. New sessionId becomes the conversation's ID

## Streaming & State

In-memory state per conversation (renderer):

```js
{
  sessionId: "uuid",
  cwd: "/path/to/project",
  messages: [
    { id, role: "user", text, images?, files? },
    { id, role: "assistant", text, toolCalls: [...], isStreaming }
  ],
  isStreaming: false,
  error: null
}
```

Events from Claude's stream-json:
- `assistant` delta → append text
- `tool_use` start → add tool call with status "running"
- `tool_use` result → update with result, status "done"
- `agent-done` → set isStreaming false

## Image & File Input

- **Images** (PNG, JPG, GIF, WebP): paste or drag-drop, preview as thumbnail, pass as image content via stdin stream
- **Files** (any other type): drag-drop, show as file chip (icon + filename), pass path to Claude
- Preview row shown above input bar with X buttons to remove

## Tool Call Display

Inline collapsible blocks in the message flow:
- Compact pill showing tool name (e.g., "Read", "Edit", "Bash")
- Click to expand: shows args and result
- Collapsed by default

## Model Picker

Existing ModelPicker updated with real Claude models. Selection passed as `--model` flag to CLI.

## Electron Setup

- Convert existing Vite + React repo (src/ stays as renderer)
- Add `electron/` directory for main process files
- `electron-builder` for packaging
- Dev mode: Vite dev server + Electron loads localhost
- Preload script exposes `window.api` via context bridge

## Backup

Original UI source backed up to `src-ui-backup/` and `index-ui-backup.html`.
