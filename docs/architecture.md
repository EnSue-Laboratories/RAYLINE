# RayLine Architecture

RayLine is an Electron desktop app with two renderer surfaces:

- the main chat window for Claude, Codex, and Multica conversations
- the GitHub Projects window for repo, issue, PR, and comment management

The renderer side is React + Vite. The main process owns all privileged work: CLI spawning, PTY sessions, git checkpoints, GitHub operations, and Multica network traffic.

## Runtime Layout

```text
src/                 React renderers, chat UI, settings, Project Manager UI
electron/main.cjs    IPC registration and BrowserWindow bootstrap
electron/*.cjs       Provider managers and platform services
public/              Icons, sounds, static assets
```

The renderers talk to the main process through `window.api`, exposed from `electron/preload.cjs` and `electron/preload-pm.cjs`.

## Conversation Backends

RayLine routes each conversation by provider:

- Claude: `electron/agent-manager.cjs` resolves the `claude` binary, spawns it with streaming output, and emits normalized events back to the renderer.
- Codex: `electron/codex-agent-manager.cjs` resolves the `codex` binary, forwards model/effort settings, and preserves provider session IDs for resume flows.
- Multica: `electron/multica-manager.cjs` talks to the Multica server over HTTPS and WebSocket, manages session creation, and re-subscribes after renderer restarts.

On the renderer side, [`src/App.jsx`](../src/App.jsx) prepares messages, captures checkpoints, and decides which provider to invoke. [`src/hooks/useAgent.js`](../src/hooks/useAgent.js) turns streamed provider events into renderable chat messages and loading state.

## Supporting Systems

- Checkpoints: `electron/checkpoint.cjs` snapshots the current git worktree before a send so RayLine can restore files to their pre-prompt state.
- Terminal drawer: `electron/terminal-manager.cjs` manages persistent `node-pty` sessions and exposes them through a local WebSocket server consumed by the renderer.
- GitHub Projects: `electron/github-manager.cjs` shells out to `gh`, including an interactive PTY-driven `gh auth login --web` flow.
- Session rehydration: `electron/session-reader.cjs` reloads stored Claude sessions from `~/.claude/projects` and Codex sessions from `~/.codex/sessions`.

## Main Flow

When you press **Send** in the chat UI:

1. `src/App.jsx` decorates the prompt with attachments and provider-specific context.
2. If the conversation has a working directory, RayLine creates a git checkpoint before the request begins.
3. `window.api.agentStart` sends the payload to `electron/main.cjs`.
4. `electron/main.cjs` dispatches to the Claude, Codex, or Multica manager.
5. Provider events stream back over IPC as `agent-stream`, and `useAgent.js` assembles them into chat-visible message parts.

## Key Files

- [`electron/main.cjs`](../electron/main.cjs): app bootstrap, IPC surface, provider routing
- [`electron/agent-manager.cjs`](../electron/agent-manager.cjs): Claude integration
- [`electron/codex-agent-manager.cjs`](../electron/codex-agent-manager.cjs): Codex integration
- [`electron/multica-manager.cjs`](../electron/multica-manager.cjs): Multica integration
- [`electron/github-manager.cjs`](../electron/github-manager.cjs): GitHub Project Manager backend
- [`electron/terminal-manager.cjs`](../electron/terminal-manager.cjs): PTY lifecycle and WebSocket fanout
- [`electron/checkpoint.cjs`](../electron/checkpoint.cjs): git snapshot create/restore
- [`electron/session-reader.cjs`](../electron/session-reader.cjs): persisted session loading
