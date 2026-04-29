# Quick Question — Design

## Problem

Users frequently want to ask the agent a one-off, throwaway question about whatever is currently on their screen — an error in their IDE, an unfamiliar UI in another app, a snippet of text. Doing this in the main chat is friction: it requires switching focus to RayLine, picking or starting a session, manually attaching a screenshot, and polluting an ongoing project conversation with unrelated turns.

Quick Question (Quick Q) gives users a global keyboard shortcut that pops up a small floating window with a fresh, ephemeral chat session and an automatically attached screenshot of the screen they were just looking at.

## Goals

- One keystroke from anywhere → a new floating window with a screenshot already attached and the input focused.
- Each invocation is a clean slate. Throwaway by design.
- Within a single floating window, follow-ups work normally.
- Reuse the runtime, agent-manager, and image-attachment plumbing that already exist in RayLine.

## Non-goals (v1, explicitly deferred)

- Persistence of Quick Q sessions or "promote to chat" UX.
- Region-select / active-window screenshot modes.
- Mouse middle-click trigger (or any global mouse hook).
- Per-feature runtime/model override.
- Image markup or annotation tools.

## User flow

1. User presses the global shortcut (default `Cmd+Shift+Space` on macOS, `Ctrl+Shift+Space` on Windows/Linux) from any application.
2. RayLine's main process captures the display the cursor is currently on (full screen).
3. A small floating window appears, centered on that display, with the screenshot as a thumbnail at the top and an autofocused text input below.
4. User types a question, presses Enter. The screenshot is attached to the first turn; the agent answer streams in.
5. User can ask follow-ups in the same window. Follow-ups go to the same ephemeral session and do not auto-attach a new screenshot (a 📷 button next to the send button can attach a fresh one).
6. User dismisses with Esc, Cmd/Ctrl+W, click-outside, or the close button. Window destroyed → ephemeral session terminated → no persistence.
7. Pressing the shortcut again opens a fresh window with a new screenshot and a new session. If the floating window is already open, the shortcut **resets** it (new screenshot, new session, refocus input) rather than opening a second window.

## Architecture

Quick Q is a new top-level Electron window peer to the existing main / project-manager / terminal windows. It reuses RayLine's existing agent runtime infrastructure unchanged.

```
Global shortcut (electron globalShortcut)
        │
        ▼
QuickQManager (electron/quick-q-manager.cjs)
        │
        ├── desktopCapturer ─► PNG buffer ─► IPC to renderer
        │
        ├── BrowserWindow (frameless, 560×420, not alwaysOnTop)
        │       │
        │       ▼
        │   src/QuickQWindow.jsx (renderer)
        │       │
        │       ▼
        │   IPC: send_message(text, screenshot_data_url)
        │
        ▼
agent-manager / codex-agent-manager / opencode-agent-manager
  (whichever runtime the main window currently uses)
        │
        ├── cwd: ~/Library/Application Support/RayLine/quick-q/  (or OS equiv)
        ├── sessionId: ephemeral UUID per Quick Q invocation
        └── streaming events ─► IPC ─► QuickQWindow renders answer
```

### New components

- `electron/quick-q-manager.cjs` — owns the floating `BrowserWindow` lifecycle, registers/unregisters the global shortcut, performs screenshot capture via `desktopCapturer`, brokers the runtime call into the existing agent managers, and tears down the ephemeral session on window close.
- `electron/preload-quick-q.cjs` — narrow IPC surface for the floating window: `requestScreenshot()`, `sendMessage(text, imageDataUrl)`, `cancel()`, `getRuntimeStatus()`, plus event listeners for streaming agent output.
- `electron/quick-q.html` — entry HTML for the floating window (mirrors `terminal-window.html` and `project-manager.html` patterns).
- `src/quick-q-main.jsx` — renderer entry, mounts `<QuickQWindow />`.
- `src/QuickQWindow.jsx` — the floating window UI (screenshot thumbnail row, autofocused input, streaming answer area).

### Reused components

- `electron/agent-manager.cjs` / `codex-agent-manager.cjs` / `opencode-agent-manager.cjs` — already accept a `cwd`, `sessionId`, and message payload with image attachments. Quick Q calls them with `cwd = quick-q scratch dir` and a fresh `sessionId` per invocation.
- `STORED_MESSAGE_IMAGE_TYPE` plumbing in `main.cjs` — same path the main window uses for paste-image attachments. Quick Q passes the screenshot through it.
- Settings UI infrastructure — Quick Q adds one row (rebind shortcut, show macOS Screen Recording permission state).

## Data flow detail

**Trigger and capture:**
1. `globalShortcut.register()` is set up on app `ready`. The bound callback calls `QuickQManager.fire()`.
2. `fire()` looks up cursor position via `screen.getCursorScreenPoint()` and the matching display via `screen.getDisplayNearestPoint()`.
3. `desktopCapturer.getSources({ types: ['screen'], thumbnailSize: <native display size> })` returns one source per display; we pick the one whose `display_id` matches.
4. The thumbnail is converted to a data URL and sent to the floating window via IPC after the window is shown.

**Window lifecycle:**
- On `fire()`: if no window exists, create it (frameless, 560×420, transparent, no traffic-light buttons, draggable header region). If a window exists, reuse it but reset state and replace the screenshot.
- On `close`: cancel any in-flight agent call, delete the ephemeral session record, destroy the window.
- The shortcut re-registers on app `ready` and unregisters on `will-quit`.

**Conversation:**
- First turn: `{ role: "user", content: prompt, attachments: [screenshot] }` → routed through the active runtime's manager.
- Follow-ups: same `sessionId` (so the runtime keeps context) but no image attachment unless the user explicitly attaches one with the 📷 button.
- Streaming events flow back via IPC to `QuickQWindow.jsx` and render into the scrollable answer area.

## Window visual / interaction spec

- Size: 560×420 default, resizable.
- Frameless, rounded corners, dark theme matching app background (`#0D0D10`).
- **Not** `alwaysOnTop` — behaves like a normal window. User can Cmd/Ctrl-Tab away and come back, or re-fire the shortcut to bring it forward.
- Header: small drag region with a close button. No tabs, no menu.
- Screenshot row: thumbnail (~80px tall), "Retake" button (re-captures the current cursor display), "Remove" button (drops the image from the next turn only).
- Input: multiline textarea, autofocused, Enter sends, Shift+Enter newline.
- Status row: runtime label (e.g. "Sonnet via Claude Code"), 📷 attach button, Send button.
- Answer area: streams agent reply with the same Markdown / code-block rendering used by the main window.
- Dismiss: Esc, Cmd/Ctrl+W, click-outside the window, or close button.

## Configuration

- **Default shortcut:** `Cmd+Shift+Space` (macOS) / `Ctrl+Shift+Space` (Windows/Linux).
- **User-rebindable** in Settings. Rebind validates the combo with `globalShortcut.register()`; on conflict, surface "couldn't register, try a different combo."
- **Persistent state:** only the chosen shortcut combo is persisted (in the existing settings store). No session content.
- **CWD for the agent runtime:** `~/Library/Application Support/RayLine/quick-q/` on macOS, equivalents on Windows (`%APPDATA%\RayLine\quick-q\`) and Linux (`~/.config/RayLine/quick-q/`). Created on first use. Same dir reused across invocations to keep agent bookkeeping (e.g., Claude Code's `.claude/`) in one tidy place.

## Error handling and edge cases

- **No runtime installed:** `QuickQManager.fire()` checks `getActiveRuntimeStatus()`. If unavailable, show a toast on the main window and abort — do not open the floating window.
- **macOS Screen Recording permission denied:** capture returns an empty/black image. Detect by checking permission state via `systemPreferences.getMediaAccessStatus('screen')` before capture. If denied, open the floating window anyway with a banner: "RayLine needs Screen Recording permission" and a deep-link button to System Settings → Privacy & Security → Screen Recording.
- **Runtime crashes mid-stream:** display the partial answer, append an error block in the answer area, leave the input editable so the user can retry. The same screenshot stays attached until the user retakes or removes it.
- **Shortcut conflict at registration:** `globalShortcut.register()` returns `false`. Log it, fall back to "no shortcut bound," and surface the issue in Settings with a "Set a shortcut" call-to-action. Quick Q is unreachable until the user picks a working combo.
- **Multi-monitor:** capture only the display the cursor is on at trigger time. Window opens centered on the same display.
- **Re-trigger while in-flight:** cancel any pending agent stream, take a fresh screenshot, start a new ephemeral session.

## Testing approach

- Unit tests for `QuickQManager` screenshot capture path (mock `desktopCapturer` and `screen`).
- Unit tests for shortcut registration / re-registration / conflict.
- Manual smoke tests on each platform:
  - macOS: first-run permission prompt, multi-monitor cursor display selection, retina vs. non-retina scaling.
  - Windows: shortcut conflicts with system shortcuts, capture under DPI scaling.
  - Linux: capture under X11 (Wayland is best-effort and may need a follow-up).
- End-to-end manual: trigger → screenshot appears → ask question → answer streams → follow-up works → close → re-trigger gives a fresh session.

## Out of scope (revisit later)

- Persisting / promoting a Quick Q to a normal chat session.
- Region-select capture mode.
- Global mouse-button trigger (would require `uiohook-napi` or equivalent and macOS Accessibility permission).
- Per-feature runtime/model override (different runtime for Quick Q vs. main window).
- Image annotation / markup before sending.
- Recent Quick Q history drawer.
