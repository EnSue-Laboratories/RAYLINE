# Interactive Terminal Sessions for Claudi

## Problem

Claude Code's Bash tool can't handle interactive terminal sessions — no persistent shells, no stdin input to running processes, no way to watch long-running output. This limits Claude's ability to work with dev servers, REPLs, interactive CLIs, and anything that needs ongoing input.

## Solution

A node-pty based terminal session manager exposed via MCP server, with a visible terminal UI in Claudi's side panel.

## Architecture

### MCP Server (`terminal-session-server`)

Local subprocess managed by Electron main process. Wraps node-pty to manage named PTY sessions.

**Tools exposed to Claude:**

- `create_session(name, command?, cwd?)` — spawn a shell (default: user's login shell)
- `send_input(name, text)` — write to stdin (supports keystrokes like `\n`, `\x03` for Ctrl+C)
- `read_output(name, lines?)` — get recent scrollback (default last 50 lines)
- `kill_session(name)` — terminate
- `list_sessions()` — list active sessions with status

A companion skill teaches Claude when to use persistent sessions vs regular Bash, how to poll output, how to handle interactive prompts.

### UI — Right Side Drawer

- Collapsed by default, opens when a session is created (by Claude or user)
- Tab bar at top for switching sessions, "+" button to create manually
- Terminal renderer: xterm.js with full ANSI/color support
- User can type directly into the focused session
- Sessions Claude is actively controlling get a subtle indicator
- Soft cap of 8 concurrent sessions

### Data Flow

```
Claude → MCP tool call → MCP server → node-pty → shell process
                                          ↓
Electron main ← IPC ← MCP server (output events)
                                          ↓
Renderer ← IPC → xterm.js (live terminal display)
```

### Session Persistence

On quit, save session metadata (name, command, cwd, env) to `claudi-state.json`. On relaunch, offer to re-spawn them. Scrollback is not preserved.

### Integration with agent-manager

`agent-manager.cjs` starts the MCP server on app launch and passes `--mcp-config` pointing to it when spawning `claude`. The MCP server communicates with the renderer via IPC for live output streaming to xterm.js.

## Consumers

- **Claude (the agent)** — programmatic control via MCP tools
- **The user** — visible terminal panel, can type into sessions, can create sessions manually via "+" button

## Constraints

- Cross-platform via node-pty (macOS, Linux, Windows)
- Soft cap of 8 concurrent sessions
- Ephemeral sessions with metadata-only persistence
