# Per-Project Context — Design

## Goal

Let the user attach a free-form context string to each project so that every chat
spawned with that project's `cwd` automatically receives the context as part of
the system prompt sent to Claude.

## Data model

Extend the project meta object stored in the existing `projects` state in
`src/App.jsx` (keyed by project root path). Existing fields: `name`, `hidden`,
`manual`, `collapsed`. Add:

- `context: string` — user-provided markdown/plain text. Empty/undefined means
  no project context.

`normalizeProjectsMeta` already merges arbitrary fields, so persistence flows
through unchanged.

## UI

### Editing an existing project
- Add an **"Edit context…"** item to the project header's "..." menu in
  `src/components/ProjectGroup.jsx`, placed above "Open in Finder".
- Selecting it opens a new `ProjectContextModal` with a multi-line textarea,
  Save / Cancel buttons, and a short hint explaining that the text is appended
  to the system prompt for chats in this project.
- Save calls a new `onEditContext(cwdRoot, context)` prop, wired in `App.jsx`
  to `setProjects`.

### Creating a new project
- In `src/components/NewProjectModal.jsx`, add an optional **"Project context"**
  textarea below the Clone and Local-folder sections (single shared field).
- Extend `onCloned` and `onPickedLocalFolder` callbacks to also pass the
  captured context. App.jsx writes it onto the project meta entry created by
  `registerManualProject` / `handleClonedRepo`.

## Wire-through to Claude

1. When `App.jsx` starts an agent for a chat with `cwd`, look up
   `projects[getMainRepoRoot(cwd)]?.context` and forward it as a new
   `projectContext` field through the existing `start-agent` IPC payload.
2. In `electron/agent-manager.cjs`, `startAgent` accepts `projectContext`. When
   it is a non-empty string, append the following block to the existing
   `--append-system-prompt` argument:

   ```
   PROJECT CONTEXT (set in RayLine for this project):
   <user's text>
   ```

3. Applied on every spawn (new + resumed chats); changes take effect on the
   next message.

## Files touched

- `src/App.jsx` — meta normalization passes context through; `handleNew*`/IPC
  call sites pass `projectContext`; new `handleEditProjectContext` setter.
- `src/components/ProjectGroup.jsx` — menu entry + modal trigger.
- `src/components/ProjectContextModal.jsx` — new component.
- `src/components/NewProjectModal.jsx` — context textarea + extended callbacks.
- `electron/agent-manager.cjs` — accept and append `projectContext`.
- `electron/main.cjs` (and preload, if applicable) — pass through new field on
  the `start-agent` IPC channel.

## Out of scope

- Writing context to a `CLAUDE.md` file in the project. Context lives in
  RayLine state only.
- Per-conversation overrides; context is project-level.
- Multi-line markdown previewing inside the modal.
