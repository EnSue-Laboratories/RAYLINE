# Issues #32 & #27 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add PR-linked indicators to the issue list view (#32) and fix new chats being created in worktree directories instead of the main repo (#27).

**Architecture:** Two independent changes — (1) new GitHub API endpoint + IssueList UI for linked PRs, (2) helper function in App.jsx to resolve main repo root from worktree paths.

**Tech Stack:** React 19, Electron 41, GitHub REST API via `gh` CLI, lucide-react icons.

---

### Task 1: Add `getLinkedPRs` to github-manager.cjs

**Files:**
- Modify: `electron/github-manager.cjs:101-229`

**Step 1: Add the getLinkedPRs function**

Add after `listBranches` (line 208), before `module.exports`:

```javascript
async function getLinkedPRs(repo, issueNumber) {
  const raw = await gh([
    "api", `/repos/${repo}/issues/${issueNumber}/timeline`,
    "-H", "Accept: application/vnd.github.mockingbird-preview+json",
    "--paginate",
  ]);
  const events = JSON.parse(raw);
  const prs = [];
  const seen = new Set();
  for (const ev of events) {
    if (ev.event === "cross-referenced" && ev.source?.issue?.pull_request) {
      const pr = ev.source.issue;
      if (!seen.has(pr.number)) {
        seen.add(pr.number);
        prs.push({
          number: pr.number,
          title: pr.title,
          state: pr.state,
          html_url: pr.html_url,
        });
      }
    }
  }
  return prs;
}
```

**Step 2: Export the new function**

Add `getLinkedPRs` to the `module.exports` object at line 210:

```javascript
module.exports = {
  checkAuth,
  listUserRepos,
  listIssues,
  listPRs,
  getIssue,
  getPR,
  listComments,
  addComment,
  listCollaborators,
  assignIssue,
  unassignIssue,
  checkoutPR,
  closeIssue,
  mergePR,
  reopenIssue,
  createIssue,
  createPR,
  listBranches,
  getLinkedPRs,
};
```

**Step 3: Commit**

```bash
git add electron/github-manager.cjs
git commit -m "feat(gh): add getLinkedPRs using Timeline Events API (#32)"
```

---

### Task 2: Wire up IPC handler and preload bridge for getLinkedPRs

**Files:**
- Modify: `electron/main.cjs:541` (after `gh-list-branches` handler)
- Modify: `electron/preload-pm.cjs:21` (after `listBranches` line)

**Step 1: Add IPC handler in main.cjs**

Add after line 541 (`gh-list-branches` handler):

```javascript
ipcMain.handle("gh-linked-prs", (_e, repo, number) => ghManager.getLinkedPRs(repo, number));
```

**Step 2: Expose in preload-pm.cjs**

Add after line 21 (`listBranches`):

```javascript
  getLinkedPRs: (repo, number) => ipcRenderer.invoke("gh-linked-prs", repo, number),
```

**Step 3: Commit**

```bash
git add electron/main.cjs electron/preload-pm.cjs
git commit -m "feat(ipc): expose getLinkedPRs to renderer (#32)"
```

---

### Task 3: Show PR indicator in IssueList rows

**Files:**
- Modify: `src/pm-components/IssueList.jsx`

**Step 1: Add GitPullRequest import**

Change line 2 from:
```javascript
import { Circle, CheckCircle2, Copy, Check } from "lucide-react";
```
to:
```javascript
import { Circle, CheckCircle2, Copy, Check, GitPullRequest } from "lucide-react";
```

**Step 2: Add linkedPRs state and fetch logic**

Add after line 22 (`const [copiedId, setCopiedId] = useState(null);`):

```javascript
  const [linkedPRs, setLinkedPRs] = useState({});
```

Add a new `useEffect` after the existing one (after line 71). This fetches linked PRs for all loaded issues:

```javascript
  useEffect(() => {
    if (issues.length === 0) return;
    let cancelled = false;
    async function fetchLinkedPRs() {
      const results = await Promise.allSettled(
        issues.map(async (item) => {
          const key = `${item._repo}/${item.number}`;
          const prs = await window.ghApi.getLinkedPRs(item._repo, item.number);
          return { key, prs };
        })
      );
      if (cancelled) return;
      const map = {};
      for (const r of results) {
        if (r.status === "fulfilled" && r.value.prs.length > 0) {
          map[r.value.key] = r.value.prs;
        }
      }
      setLinkedPRs(map);
    }
    fetchLinkedPRs();
    return () => { cancelled = true; };
  }, [issues]);
```

**Step 3: Add PR icon in the issue row**

In the issue row rendering (line 128-130 area), add the PR indicator after the issue number span. Replace:

```jsx
              <span style={{ color: "rgba(255,255,255,0.35)", fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
                #{item.number}
              </span>
```

with:

```jsx
              <span style={{ color: "rgba(255,255,255,0.35)", fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
                #{item.number}
              </span>
              {linkedPRs[`${item._repo}/${item.number}`] && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: "rgba(255,255,255,0.35)" }} title={`${linkedPRs[`${item._repo}/${item.number}`].length} linked PR${linkedPRs[`${item._repo}/${item.number}`].length > 1 ? "s" : ""}`}>
                  <GitPullRequest size={12} strokeWidth={1.5} />
                  {linkedPRs[`${item._repo}/${item.number}`].length > 1 && (
                    <span style={{ fontSize: 10, fontFamily: "system-ui" }}>{linkedPRs[`${item._repo}/${item.number}`].length}</span>
                  )}
                </span>
              )}
```

**Step 4: Commit**

```bash
git add src/pm-components/IssueList.jsx
git commit -m "feat(ui): show linked PR indicator on issue list rows (#32)"
```

---

### Task 4: Fix new chats using worktree path instead of main repo root (#27)

**Files:**
- Modify: `src/App.jsx:143-156, 219-226`

**Step 1: Add getMainRepoRoot helper**

Add before the `App` component (after the imports, around line 12, after `logCheckpoint`):

```javascript
function getMainRepoRoot(dir) {
  if (!dir) return dir;
  const wtIdx = dir.indexOf("/.worktrees/");
  return wtIdx !== -1 ? dir.slice(0, wtIdx) : dir;
}
```

**Step 2: Fix handleNew to use main repo root**

Change line 152 in `handleNew` from:
```javascript
      cwd: cwd || undefined,
```
to:
```javascript
      cwd: getMainRepoRoot(cwd) || undefined,
```

**Step 3: Fix auto-create path to use main repo root**

Change line 223 in the auto-create block from:
```javascript
    convo = { id, sessionId, title: text.slice(0, 50), model: defaultModel, ts: Date.now(), cwd: cwd || undefined };
```
to:
```javascript
    convo = { id, sessionId, title: text.slice(0, 50), model: defaultModel, ts: Date.now(), cwd: getMainRepoRoot(cwd) || undefined };
```

**Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "fix: create new chats in main repo root, not worktree dir (#27)"
```

---

### Task 5: Build verification

**Step 1: Run the build**

```bash
npm run build
```

Expected: Build succeeds with no errors.

**Step 2: Commit if any build fixes were needed**

If the build required fixes, commit them:
```bash
git add -A
git commit -m "fix: address build issues"
```
