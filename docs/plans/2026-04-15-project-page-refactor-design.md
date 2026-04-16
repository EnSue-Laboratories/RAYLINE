# GitHub Project Page Refactor — Design

**Issue:** #46  
**Date:** 2026-04-15

## Problems

1. Branch selectors in the PR create form are plain `<select>` — unusable with many branches
2. HEAD branch defaults to the first branch alphabetically, not the currently checked-out branch
3. No image paste support in the description textarea
4. `gh pr create` without `--body` opens an interactive editor, hanging in Electron

## Changes

### 1. SearchableSelect component

New `src/pm-components/SearchableSelect.jsx` — a controlled combobox:

- Text input that filters a dropdown list as you type (case-insensitive substring match)
- Clicking an item or pressing Enter selects it; Escape closes the dropdown
- Reuses existing `inputStyle` from CreateForm for visual consistency
- Props: `options: string[]`, `value: string`, `onChange: (val) => void`, `placeholder?: string`

Replaces both HEAD and BASE `<select>` elements in CreateForm.

### 2. Default HEAD to current branch

**Backend additions:**

- `github-manager.cjs` — add `getCurrentBranch()`: runs `git rev-parse --abbrev-ref HEAD` in the app's cwd
- `github-manager.cjs` — add `getRepoDefaultBranch(repo)`: calls `gh api /repos/{repo}` and returns `default_branch`
- Wire both through IPC in `main.cjs` and expose via `preload-pm.cjs`

**Frontend logic in CreateForm:**

- On mount (when type is "pr"), fetch `getCurrentBranch()` and `getRepoDefaultBranch(repo)`
- Set HEAD to the current branch if it exists in the remote branch list, otherwise first branch
- Set BASE to the repo's default branch (usually "main") instead of hardcoding "main"

### 3. Image paste in description

- Add `handlePaste` on the description textarea in CreateForm
- When an image is pasted, read it as a data URL, show an inline preview below the textarea
- Store images as attachments; on submit, upload each via a new `uploadImage(repo, imageBuffer, filename)` in `github-manager.cjs` (uses `gh api` to upload to the repo)
- Insert the returned markdown `![image](url)` into the body before creating the issue/PR

### 4. PR description optional fix

In `github-manager.cjs` `createPR()`: always pass `--body` with either the body text or an empty string, so `gh pr create` never tries to open an interactive editor.

```js
args.push("--body", body || "");
```

## Files touched

| File | Change |
|------|--------|
| `electron/github-manager.cjs` | Add `getCurrentBranch`, `getRepoDefaultBranch`, `uploadImage`; fix `createPR` |
| `electron/main.cjs` | Wire 3 new IPC handlers |
| `electron/preload-pm.cjs` | Expose 3 new methods on `window.ghApi` |
| `src/pm-components/SearchableSelect.jsx` | New component |
| `src/pm-components/CreateForm.jsx` | Use SearchableSelect, add paste handler, default branch logic |
