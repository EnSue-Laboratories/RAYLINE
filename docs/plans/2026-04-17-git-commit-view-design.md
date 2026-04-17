# Git Commit View — Design

**Issue:** [#57 Git Commit View](https://github.com/EnSue-Laboratories/Ensue-Chat/issues/57)
**Date:** 2026-04-17

## Goal

Show at-a-glance git state (uncommitted changes, unfetched upstream commits) in the chat top-bar, and let the user commit-and-push or pull without leaving the app.

## Placement

Inline pill mounted directly before `<BranchSelector>` in `src/components/ChatArea.jsx:289`. Matches the issue screenshot's slim horizontal shape and the existing BranchSelector visual pattern.

## Components

- **New:** `src/components/GitStatusPill.jsx` — pill trigger + popover.
- **New:** `src/hooks/useGitStatus.js` — polling, auto-fetch, cwd lifecycle.
- **Modified:** `electron/main.cjs` — six new IPC handlers.
- **Modified:** `electron/preload.cjs` — expose on `window.api`.
- **Modified:** `src/components/ChatArea.jsx` — mount pill next to BranchSelector.

## IPC handlers

All handlers reuse the existing `git()` exec wrapper in `main.cjs:484` (inherits `cwd` and `GIT_TERMINAL_PROMPT=0` — worktrees work unchanged).

| Handler | Command | Returns |
|---|---|---|
| `git-status` | `git status --porcelain=v2 --branch -z` | `{ branch, upstream, ahead, behind, files: [{path, index, worktree}] }` |
| `git-fetch` | `git fetch --no-tags --quiet` | `{ ok, error? }` — silent failure; error surfaces only on user-initiated action |
| `git-diff` | `git diff HEAD` capped at 64 KB | `{ diff, truncated }` |
| `git-commit` | `git add -A && git commit -m <msg>` | `{ ok, stdout, stderr }` |
| `git-push` | `git push` (or `push -u origin <branch>` when no upstream) | `{ ok, stderr }` |
| `git-pull` | `git pull --ff-only` | `{ ok, stderr }` — non-ff returns error; user resolves in terminal |
| `git-generate-commit-message` | `claude -p "<prompt>"` with diff on stdin, 15s timeout | `{ message }` |

`claude` is resolved via the existing `resolveCliBin("claude")` pattern already used at `main.cjs:411`.

## useGitStatus hook

- Runs `git-status` on mount, then every **10s** (local-only, cheap).
- Runs `git-fetch` every **60s** (first run offset by 3s), then re-runs `git-status` to refresh ahead/behind.
- `document.visibilitychange` hidden → pause timers.
- Window focus → immediate re-poll.
- cwd change → reset timers, clear state.
- Not a git repo → returns `null`; pill renders nothing.

## Pill visual

Inline pill ~22px tall next to `BranchSelector`, matching its rounded rect + 1px `rgba(255,255,255,0.06)` border.

States:

- **Clean & in sync:** dim `GIT` label, no counters.
- **Dirty:** amber `●N` (changed files).
- **Behind:** blue `↓N`.
- **Ahead:** white `↑N` (often alongside `↓` = diverged).
- **Detached HEAD / no upstream:** gray italic `local`; push/pull disabled with tooltip.

Click opens popover downward-right, ~360px wide, same styling language as `BranchSelector` popover.

## Popover layout

```
┌───────────────────────────────────────────────┐
│ main → origin/main              ↑0 ↓2         │
├───────────────────────────────────────────────┤
│ CHANGED FILES (3)                              │
│  M  src/components/ChatArea.jsx                │
│  M  electron/main.cjs                          │
│  ?? docs/plans/2026-04-17-git-commit-view...md │
├───────────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ ✨ Gen │
│ │ <commit message textarea>           │        │
│ └─────────────────────────────────────┘        │
├───────────────────────────────────────────────┤
│ [ Commit & Push ]            [ Pull ]          │
└───────────────────────────────────────────────┘
```

- Opening the popover triggers an immediate status + fetch refresh (no dedicated refresh button).
- **Commit & Push:** disabled when no changes OR message empty. On click: `git-commit` → `git-push` sequentially; error surfaces below buttons.
- **Pull:** disabled when `behind === 0`. `--ff-only`; on conflict shows stderr snippet and directs user to terminal.
- **Generate (✨):** calls `git-generate-commit-message`, shows spinner, fills textarea. User edits before committing.

## Error handling

- Every handler returns `{ ok, error? }`; UI never throws.
- Errors render as a dismissible red strip at the bottom of the popover.
- Long-running ops (push/pull) show spinner and disable buttons for the duration.
- Push rejected (non-ff) → inline hint "Pull first".

## Failure modes

- **No remote configured:** `upstream === null`; push/pull disabled.
- **Detached HEAD:** no branch; commit button disabled, pill shows `detached`.
- **Merge conflict on pull:** stderr shown; user resolves in terminal (`.worktrees/<name>` if applicable).
- **Credentials required:** `GIT_TERMINAL_PROMPT=0` means silent fail; error surfaces from stderr.

## Testing

- Manual QA: dev server, open a repo, verify pill states for clean / dirty / ahead / behind / diverged / detached / no-upstream.
- No unit tests — logic is thin IPC wrapping `git`; git itself is the source of truth.

## Out of scope

- Individual file staging (stages all with `git add -A`).
- Diff viewer UI.
- Conflict resolution UI (terminal handles it).
- Remote branch creation wizard (use BranchSelector).
