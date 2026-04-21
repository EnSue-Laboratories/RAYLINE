# Dispatch — design

Date: 2026-04-19
Status: Approved for implementation planning

## Goal

Let the user spawn several independent Claude Code chats at once, each in its
own git worktree and branch, from either a list of GitHub issues or a
user-authored list of prompts. One click, N parallel chats.

## Non-goals (YAGNI)

- No top-bar tab grouping UI. Dispatch stores a `dispatchId` + tags on each
  chat; a future grouping layer consumes them.
- No progress dashboard. Each spawned chat already shows its own status in the
  sidebar.
- No scheduling, queueing, throttling, or cross-row coordination. All tasks
  fire simultaneously. If the user wants fewer in flight, they dispatch fewer.
- No subagent-type routing. Per-task model variant only.

## Entry point

A new sidebar button labelled **Dispatch**, placed between `New Chat` and
`GitHub Projects`. Clicking opens a centered modal styled like the existing
`NewChatCard`.

## Modal shell

- Two tabs at the top of the modal: **From Issues** and **Custom**.
- A global **Model** picker (default `SONNET`) that applies to every row unless
  the row overrides it.
- Primary footer button: **Dispatch N tasks** (disabled until at least one
  enabled row is valid).

## Mode: From Issues

1. **Repo picker** — dropdown populated from the existing `projects` state
   (the same set that powers GitHub Projects). To dispatch against a repo not
   yet tracked, the user adds it via GitHub Projects first. No new tracking
   plumbing in Dispatch.
2. **Issue table** loaded from `window.ghApi.listIssues(repo, "open")`.
   Columns per row:
   - Checkbox (enables/disables the row)
   - `#42 — Title` (click the chevron to expand an editable textarea prefilled
     with `Fix issue #42: <title>\n\n<body>`)
   - Branch name (editable, default `issue-42-<slug>`)
   - Model override (empty = use global)
   - Remove
3. Header checkbox toggles select-all / none.

## Mode: Custom

Plain table with these columns:

- Prompt (multi-line textarea, required)
- Branch name (editable, default `dispatch-<yyyymmdd-hhmm>-<n>`)
- Model override
- Attachment (paperclip, optional image — per row, so some rows have images
  and some don't)
- Remove

One `+ Add task` button below the table. The parent cwd = the folder currently
selected in the sidebar (same source `New Chat` uses via `getMainRepoRoot`).

## Per-row override

Both tabs share the "one picker applies to all, overrideable per row" pattern:
the global model picker is the default, a per-row dropdown overrides it.
Applies symmetrically to both tabs.

## Dispatch execution

On click of **Dispatch N tasks**:

1. Validate every enabled row: non-empty prompt, non-empty branch name, and
   branch names unique within the batch. If anything fails, surface row-level
   errors and keep the modal open.
2. For each row, call `handleCreateChat({...})` in parallel with
   `Promise.allSettled`. Arguments per call:
   ```
   {
     prompt,              // from row (or issueContext + prompt in issue mode)
     attachments,         // from row (custom mode only)
     model,               // row override OR global default
     cwd: parentRepoRoot, // issue repo root OR current folder
     worktree: true,
     branch,              // from row
     issueContext,        // optional "issue #42: <title>\n<body>" block
   }
   ```
3. Tag the resulting conversation with:
   - `dispatchId` — a shared UUID for the whole batch
   - `tags: ["dispatch", ...]` — plus `#42` etc. in issue mode
   The sidebar renders these tags as small pills on the chat row.
4. Handle `Promise.allSettled` results:
   - Success rows disappear from the modal.
   - Failed rows stay, with the error (e.g. "branch already exists", "dirty
     worktree") shown inline so the user can adjust and retry.
   - Show a summary toast: "Dispatched K of N tasks".

## Data model changes

Add two optional fields to a conversation record:

- `dispatchId?: string` — groups chats from the same batch
- `tags?: string[]` — short strings rendered as sidebar pills

Nothing else in the persistence layer changes. `handleCreateChat` already
creates the worktree, assigns cwd, and sends the first message.

## Error cases

- **Branch name collision** (local or remote): the `gitWorktreeAdd` call
  rejects — that row fails, others continue.
- **No parent cwd selected** in Custom mode: dispatch button stays disabled
  with tooltip "Select a folder first".
- **Issue fetch fails**: show the error in-modal, no rows rendered, user can
  retry or switch tabs.
- **Partial success**: K-of-N toast + failed rows kept in modal for retry.

## Files likely touched (non-binding)

- `src/App.jsx` — existing `handleCreateChat` gets a slight extension to
  accept and persist `dispatchId`/`tags`; a new orchestrator function wraps
  multiple calls.
- `src/components/Sidebar.jsx` — new `Dispatch` button, tag pill rendering.
- `src/components/DispatchCard.jsx` (new) — the modal, both tabs, validation.
- Probably a small helper module for branch-slug generation and default name
  formatting.

Exact structure is for the implementation plan to finalize.
