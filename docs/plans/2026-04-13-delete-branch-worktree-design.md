# Delete Branches & Worktrees from Dropdown

## Summary

Add inline delete capability to both tabs of the BranchSelector dropdown with confirmation UX.

## Branches Tab

- Trash2 icon appears on hover (right side of each row)
- Protected: `main`, `master`, and the currently checked-out branch hide the delete icon
- Clicking icon transforms row into inline confirmation: red-tinted row with "Delete?" + confirm/cancel
- Backend: new `git-delete-branch` IPC handler using `git branch -D`

## Worktrees Tab

- Trash2 icon on hover for each worktree (not "None")
- Protected: currently active worktree (matching `cwd`) hides delete icon
- Inline confirmation includes checkbox: "Also delete branch"
- On confirm: `gitWorktreeRemove` then optionally `gitDeleteBranch`

## Changes

| File | Change |
|------|--------|
| `electron/main.cjs` | Add `git-delete-branch` IPC handler |
| `electron/preload.cjs` | Expose `gitDeleteBranch` |
| `src/components/BranchSelector.jsx` | Delete UI, confirmation state, Trash2 import |

## Edge Cases

- Can't delete branch you're on (git enforces this)
- Dirty worktree removal shows error inline
- After delete, `refresh()` updates both tabs
