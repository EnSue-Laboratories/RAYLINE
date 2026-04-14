# Claudi

Claudi is an Electron desktop client for Claude Code built with React and Vite.
This repository is published as `Ensue-Chat`, while the packaged app and product
name in the codebase are `Claudi`.

The app wraps the Claude CLI in a desktop chat interface and adds a few workflow
features that are hard to get from a plain terminal session:

- persistent conversations backed by Claude session files
- streaming responses with tool call and thinking visibility
- message editing with checkpoint-based file rewind support
- image and file attachments
- embedded terminal sessions exposed through MCP
- terminal session CLI fallback for agents that can run shell commands
- quick system context and local workspace selection

## Tech Stack

- Electron
- React 19
- Vite
- Claude Code CLI
- node-pty
- xterm.js

## Prerequisites

Before running the app locally, make sure you have:

- Node.js and npm installed
- the `claude` CLI installed and available on your `PATH`
- an authenticated Claude Code environment

The Electron packaging config in `package.json` is currently set up for macOS
distribution, but the development workflow is the standard Electron + Vite loop.

## Getting Started

Install dependencies:

```bash
npm install
```

If Electron or `node-pty` was updated, rebuild the native dependency:

```bash
npm run rebuild
```

Start the desktop app in development mode:

```bash
npm run dev:electron
```

This starts the Vite dev server on port `5199` and then launches Electron
against that renderer.

## Available Scripts

- `npm run dev` - start the Vite renderer only
- `npm run dev:electron` - start Vite and Electron together
- `npm run build` - build the renderer for production
- `npm run build:electron` - build the renderer and package the desktop app
- `npm run lint` - run ESLint
- `npm run preview` - preview the production renderer build
- `npm run rebuild` - rebuild `node-pty` for the active Electron version

## How It Works

Claudi uses the Electron main process to spawn Claude Code as a child process
with streaming JSON output:

```text
claude --print --output-format=stream-json --include-partial-messages ...
```

At a high level:

1. The renderer sends prompts and attachments through Electron IPC.
2. The main process launches `claude` and forwards streamed events back to the UI.
3. Conversation history is restored from Claude session files.
4. Git checkpoints can be created before a prompt so edits can rewind file state.
5. Terminal sessions run through `node-pty` and are exposed to Claude through a
   local MCP server.

## Project Structure

```text
.
|- electron/      Electron main process, Claude process manager, terminal server
|- src/           Main React application
|- public/        Static assets and app icons
|- docs/plans/    Implementation and design notes
|- build/         Packaging configuration
```

Some files worth reading first:

- `electron/main.cjs` - Electron bootstrap and IPC surface
- `electron/agent-manager.cjs` - Claude process spawning and stream handling
- `electron/terminal-manager.cjs` - persistent PTY-backed terminal sessions
- `scripts/claudi-terminal.cjs` - shell-friendly wrapper for the terminal session backend
- `src/App.jsx` - top-level chat application state and interaction flow
- `src/hooks/useAgent.js` - streamed message assembly in the renderer

## Notes

- The repository currently contains both the active UI in `src/` and a backup UI
  snapshot in `src-ui-backup/`.
- External links are opened in the system browser from the Electron shell.
- App state is persisted to the Electron user data directory as `claudi-state.json`.
