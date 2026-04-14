# GitHub Project Manager — Design

## Overview

A new Electron window for managing GitHub issues and PRs across multiple repos. Designed for solo devs who want a simple, unified view of their work. No project boards, no milestones, no extra features — just issues, PRs, comments, and assignments.

## Architecture

### Approach: Separate BrowserWindow

New Electron BrowserWindow spawned from main process. Isolated from the chat window — own HTML entry, own React root, own preload/IPC bridge.

### File Structure

```
electron/
  main.cjs              # Add: createProjectManagerWindow(), PM IPC handlers
  preload-pm.cjs        # New: IPC bridge (window.ghApi)
  github-manager.cjs    # New: All gh CLI wrappers

src/
  project-manager.html  # New: HTML entry
  ProjectManager.jsx    # New: React root
  pm-components/
    RepoManager.jsx     # Add/remove repos
    IssueList.jsx       # Issues view
    PRList.jsx          # PRs view
    ItemDetail.jsx      # Single issue/PR detail + comments
    CommentBox.jsx      # Write comment + assign picker
```

### Data Flow

Renderer calls `window.ghApi.*` methods via IPC. Main process executes `gh api` CLI commands, parses JSON, returns through IPC.

### Persistence

Added repos stored in `claudi-state.json` under `pmRepos: ["owner/repo", ...]` alongside existing app state.

## Authentication

Relies on `gh` CLI auth (same philosophy as relying on `claude` CLI). On window open, check `gh auth status`. If not authenticated, show message directing user to run `gh auth login`.

## UI Layout

### Sidebar Button

GitHub icon (Lucide `Github`) at the bottom of the existing sidebar, near the settings gear. Opens/focuses the PM window.

### PM Window (1000x700)

Dark theme matching main app — glassmorphism, system-ui font, Lucide icons.

```
+--------------------------------------------------+
|  GitHub Projects                   [+ Add Repo]  |  Header
+--------+-----------------------------------------+
|        |  [Issues]  [Pull Requests]  Open|Closed |  Tabs + filter
| Repos  +-----------------------------------------+
|        |  #42 Fix auth bug            Ensue-Chat |  Flat list
| * All  |  #15 Add dark mode           Ensue-Web  |  sorted by
|   Repo1|  #8  Broken CI              Ensue-CLI   |  updated_at desc
|   Repo2|                                         |
|        |                                         |
|[Manage |                                         |
| Repos] |                                         |
+--------+-----------------------------------------+
```

### Navigation

- Left sidebar: repo filter ("All" default, or filter to single repo)
- Top: Issues / Pull Requests tab toggle
- Right of tabs: Open / Closed toggle
- Click item: replaces list with detail view + back button
- Repo name as subtle muted text on right side of each row

### Detail View

Replaces the list entirely when an item is clicked. Back button to return.

- Title, body (markdown rendered), labels, assignees, state
- Comments list (markdown rendered)
- Comment input box at bottom
- Assign dropdown (fetches repo collaborators — includes AI agents/CI bots)

## Data Operations

### Repos
- Add: modal listing user's GitHub repos via `gh api /user/repos`, select to add
- Remove: "Manage Repos" button in sidebar
- Stored in claudi-state.json

### Issues
- Fetch: `gh api /repos/{owner}/{repo}/issues?state=open|closed` per repo
- Merge all repos, sort by `updated_at` descending
- Display: number, title, repo tag, author, time ago

### Pull Requests
- Fetch: `gh api /repos/{owner}/{repo}/pulls?state=open|closed` per repo
- Same merge + sort pattern
- Display: number, title, repo tag, author, time ago, merge status

### Comments
- Read: `gh api /repos/{owner}/{repo}/issues/{number}/comments`
- Write: POST via `gh api`

### Assignments
- Fetch collaborators: `gh api /repos/{owner}/{repo}/collaborators`
- Assign/unassign via `gh api`

### Pagination
- No pagination — fetch first 100 per repo (gh default). Sufficient for solo dev.

## Error Handling

- **gh not authenticated:** Message with instructions to run `gh auth login`
- **Repo not found:** Toast error when adding fails
- **API failures:** Inline error where list would be, with retry button
