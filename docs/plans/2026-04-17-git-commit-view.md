# Git Commit View Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an inline pill in the chat top-bar that shows uncommitted changes + unfetched upstream commits, with Commit & Push and Pull actions. (Issue #57)

**Architecture:** Six new IPC handlers in `electron/main.cjs` wrap `git` via the existing `git()` exec helper and the `claude` CLI via the pattern at `main.cjs:411`. A `useGitStatus` hook polls status every 10s and auto-fetches every 60s. A `<GitStatusPill>` React component renders the pill trigger and popover, mounted next to `<BranchSelector>` in `ChatArea`.

**Tech Stack:** Electron 41, React 19, lucide-react icons, plain `git` CLI, Claude CLI for AI-generated commit messages.

**Reference:** `docs/plans/2026-04-17-git-commit-view-design.md`

**Verification policy:** This project has no unit tests for UI/IPC. Each task ends with `npm run lint` (fast) and a manual smoke step against the dev app where applicable.

---

### Task 1: Add git-status IPC handler

**Files:**
- Modify: `electron/main.cjs` (insert after `git-worktree-remove` handler at line 581)

**Step 1: Add the handler**

Insert directly after the `ipcMain.handle("git-worktree-remove", ...)` block:

```javascript
ipcMain.handle("git-status", async (_event, cwd) => {
  if (!cwd) return null;
  try {
    const raw = await git(["status", "--porcelain=v2", "--branch"], cwd);
    const out = {
      branch: null,
      upstream: null,
      ahead: 0,
      behind: 0,
      files: [],
      detached: false,
    };
    for (const line of raw.split("\n")) {
      if (!line) continue;
      if (line.startsWith("# branch.head ")) {
        const head = line.slice(14).trim();
        if (head === "(detached)") out.detached = true;
        else out.branch = head;
      } else if (line.startsWith("# branch.upstream ")) {
        out.upstream = line.slice(18).trim();
      } else if (line.startsWith("# branch.ab ")) {
        const m = line.slice(12).match(/^\+(\d+) -(\d+)/);
        if (m) { out.ahead = Number(m[1]); out.behind = Number(m[2]); }
      } else if (line.startsWith("1 ") || line.startsWith("2 ")) {
        // tracked: "1 XY ... <path>"
        const parts = line.split(" ");
        const xy = parts[1];
        const path = parts.slice(8).join(" ");
        out.files.push({ path, index: xy[0], worktree: xy[1] });
      } else if (line.startsWith("? ")) {
        out.files.push({ path: line.slice(2), index: "?", worktree: "?" });
      } else if (line.startsWith("! ")) {
        // ignored — skip
      }
    }
    return out;
  } catch {
    return null;
  }
});
```

**Step 2: Lint**

Run: `npm run lint`
Expected: passes (no new warnings).

**Step 3: Smoke test**

Open DevTools in the running app and run:
```js
await window.api.gitStatus(await window.api.getCwd?.() ?? null)
```
(It won't work yet — `gitStatus` is exposed in Task 3. Skip for now, we'll verify end-to-end later.)

**Step 4: Commit**

```bash
git add electron/main.cjs
git commit -m "feat(git): add git-status IPC handler (#57)"
```

---

### Task 2: Add git-fetch, git-diff, git-commit, git-push, git-pull handlers

**Files:**
- Modify: `electron/main.cjs` (append after the `git-status` handler from Task 1)

**Step 1: Add the five handlers**

```javascript
ipcMain.handle("git-fetch", async (_event, cwd) => {
  if (!cwd) return { ok: false, error: "no cwd" };
  try {
    await git(["fetch", "--no-tags", "--quiet"], cwd);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("git-diff", async (_event, cwd) => {
  if (!cwd) return { diff: "", truncated: false };
  try {
    const raw = await git(["diff", "HEAD"], cwd);
    const LIMIT = 64 * 1024;
    if (raw.length > LIMIT) {
      return { diff: raw.slice(0, LIMIT), truncated: true };
    }
    return { diff: raw, truncated: false };
  } catch {
    // fallback for repos with no HEAD (initial commit)
    try {
      const raw = await git(["diff"], cwd);
      return { diff: raw.slice(0, 64 * 1024), truncated: raw.length > 64 * 1024 };
    } catch {
      return { diff: "", truncated: false };
    }
  }
});

ipcMain.handle("git-commit", async (_event, cwd, message) => {
  if (!cwd) return { ok: false, stderr: "no cwd" };
  if (!message || !message.trim()) return { ok: false, stderr: "empty message" };
  try {
    await git(["add", "-A"], cwd);
    const stdout = await git(["commit", "-m", message], cwd);
    return { ok: true, stdout };
  } catch (err) {
    return { ok: false, stderr: err.message };
  }
});

ipcMain.handle("git-push", async (_event, cwd) => {
  if (!cwd) return { ok: false, stderr: "no cwd" };
  try {
    // Check upstream; push -u if absent.
    let args = ["push"];
    try {
      await git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], cwd);
    } catch {
      const branch = await git(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
      args = ["push", "-u", "origin", branch];
    }
    const stdout = await git(args, cwd);
    return { ok: true, stdout };
  } catch (err) {
    return { ok: false, stderr: err.message };
  }
});

ipcMain.handle("git-pull", async (_event, cwd) => {
  if (!cwd) return { ok: false, stderr: "no cwd" };
  try {
    const stdout = await git(["pull", "--ff-only"], cwd);
    return { ok: true, stdout };
  } catch (err) {
    return { ok: false, stderr: err.message };
  }
});
```

**Step 2: Bump the git() timeout for push/pull**

`main.cjs:486` has `timeout: 10000` — push/pull can exceed this on slow networks. Change the `git()` helper to accept a per-call timeout, OR add a parallel `gitLong()` helper. Choose the latter to avoid risk to existing callers:

Insert right after the existing `git(args, cwd)` function (after line 491):

```javascript
function gitLong(args, cwd) {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }, timeout: 60000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr.trim() || err.message));
      else resolve(stdout.trim());
    });
  });
}
```

Then in the three handlers above that do network work (`git-fetch`, `git-push`, `git-pull`), replace the `git(...)` calls with `gitLong(...)`.

**Step 3: Lint**

Run: `npm run lint`
Expected: passes.

**Step 4: Commit**

```bash
git add electron/main.cjs
git commit -m "feat(git): add fetch/diff/commit/push/pull IPC handlers (#57)"
```

---

### Task 3: Add git-generate-commit-message handler (Claude CLI)

**Files:**
- Modify: `electron/main.cjs` (append after the Task 2 handlers)

**Step 1: Add the handler**

```javascript
ipcMain.handle("git-generate-commit-message", async (_event, cwd) => {
  if (!cwd) return { message: "" };
  const { spawn } = require("child_process");

  // Pull diff ourselves (don't trust renderer to pass large blobs).
  let diff;
  try {
    diff = await git(["diff", "HEAD"], cwd);
  } catch {
    try { diff = await git(["diff"], cwd); } catch { diff = ""; }
  }
  if (!diff.trim()) return { message: "" };
  const LIMIT = 64 * 1024;
  if (diff.length > LIMIT) diff = diff.slice(0, LIMIT);

  return new Promise((resolve) => {
    const claudeBin = resolveCliBin("claude", { envVarName: "CLAUDE_BIN" });
    if (!claudeBin) { resolve({ message: "" }); return; }

    const prompt = "Write a single-line conventional-commit-style message for this diff. Under 72 chars. No quotes, no prefixes like \"here's the message:\". Output only the commit message.";
    const args = [
      "--print",
      "--output-format", "text",
      "--tools", "",
      "--model", "haiku",
      "--no-session-persistence",
      "--system-prompt", prompt,
    ];
    const child = spawn(claudeBin, args, {
      env: { ...process.env, FORCE_COLOR: "0", PATH: buildSpawnPath() },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (c) => { out += c.toString(); });
    child.stderr.on("data", () => {});
    child.on("close", () => resolve({ message: out.trim().split("\n")[0] || "" }));
    child.on("error", () => resolve({ message: "" }));
    const timer = setTimeout(() => { try { child.kill(); } catch {} resolve({ message: out.trim().split("\n")[0] || "" }); }, 15000);
    child.on("close", () => clearTimeout(timer));
    child.stdin.write(diff);
    child.stdin.end();
  });
});
```

**Step 2: Lint**

Run: `npm run lint`
Expected: passes.

**Step 3: Commit**

```bash
git add electron/main.cjs
git commit -m "feat(git): add AI commit message generator via claude CLI (#57)"
```

---

### Task 4: Expose new APIs in preload.cjs

**Files:**
- Modify: `electron/preload.cjs` (after line 58, the `// Git operations` block)

**Step 1: Add the new API methods**

Replace the `// Git operations` block (lines 51-58) with:

```javascript
  // Git operations
  gitBranches: (cwd) => ipcRenderer.invoke("git-branches", cwd),
  gitCreateBranch: (cwd, name) => ipcRenderer.invoke("git-create-branch", cwd, name),
  gitCheckout: (cwd, name) => ipcRenderer.invoke("git-checkout", cwd, name),
  gitWorktreeList: (cwd) => ipcRenderer.invoke("git-worktree-list", cwd),
  gitWorktreeAdd: (cwd, path, branch, options) => ipcRenderer.invoke("git-worktree-add", cwd, path, branch, options),
  gitDeleteBranch: (cwd, name) => ipcRenderer.invoke("git-delete-branch", cwd, name),
  gitWorktreeRemove: (cwd, path) => ipcRenderer.invoke("git-worktree-remove", cwd, path),
  gitStatus: (cwd) => ipcRenderer.invoke("git-status", cwd),
  gitFetch: (cwd) => ipcRenderer.invoke("git-fetch", cwd),
  gitDiff: (cwd) => ipcRenderer.invoke("git-diff", cwd),
  gitCommit: (cwd, message) => ipcRenderer.invoke("git-commit", cwd, message),
  gitPush: (cwd) => ipcRenderer.invoke("git-push", cwd),
  gitPull: (cwd) => ipcRenderer.invoke("git-pull", cwd),
  gitGenerateCommitMessage: (cwd) => ipcRenderer.invoke("git-generate-commit-message", cwd),
```

**Step 2: Lint**

Run: `npm run lint`
Expected: passes.

**Step 3: Smoke test**

Restart dev app (`npm run dev`), open DevTools, run:
```js
await window.api.gitStatus("/path/to/any/git/repo")
```
Expected: returns `{ branch, upstream, ahead, behind, files, detached }`. Manually make a change, re-run — expect `files` to include it.

**Step 4: Commit**

```bash
git add electron/preload.cjs
git commit -m "feat(git): expose new git IPC handlers on window.api (#57)"
```

---

### Task 5: Create useGitStatus hook

**Files:**
- Create: `src/hooks/useGitStatus.js`

**Step 1: Write the hook**

```javascript
import { useState, useEffect, useRef, useCallback } from "react";

const POLL_MS = 10_000;
const FETCH_MS = 60_000;
const FETCH_INITIAL_DELAY = 3_000;

export default function useGitStatus(cwd) {
  const [status, setStatus] = useState(null); // null = not loaded / not a repo
  const [busy, setBusy] = useState(false);    // true during push/pull/commit
  const pollTimer = useRef(null);
  const fetchTimer = useRef(null);
  const cancelled = useRef(false);

  const refresh = useCallback(async () => {
    if (!cwd || !window.api?.gitStatus) return;
    const s = await window.api.gitStatus(cwd);
    if (!cancelled.current) setStatus(s);
  }, [cwd]);

  const refetch = useCallback(async () => {
    if (!cwd || !window.api?.gitFetch) return;
    await window.api.gitFetch(cwd);
    await refresh();
  }, [cwd, refresh]);

  useEffect(() => {
    cancelled.current = false;
    setStatus(null);
    if (!cwd) return () => {};

    refresh();
    pollTimer.current = setInterval(() => {
      if (!document.hidden) refresh();
    }, POLL_MS);

    const fetchKickoff = setTimeout(() => {
      if (!document.hidden) refetch();
      fetchTimer.current = setInterval(() => {
        if (!document.hidden) refetch();
      }, FETCH_MS);
    }, FETCH_INITIAL_DELAY);

    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled.current = true;
      clearInterval(pollTimer.current);
      clearInterval(fetchTimer.current);
      clearTimeout(fetchKickoff);
      window.removeEventListener("focus", onFocus);
    };
  }, [cwd, refresh, refetch]);

  return { status, busy, setBusy, refresh, refetch };
}
```

**Step 2: Lint**

Run: `npm run lint`
Expected: passes.

**Step 3: Commit**

```bash
git add src/hooks/useGitStatus.js
git commit -m "feat(git): add useGitStatus hook (#57)"
```

---

### Task 6: Create GitStatusPill component (pill trigger only)

**Files:**
- Create: `src/components/GitStatusPill.jsx`

**Step 1: Minimal pill with counters, no popover yet**

```jsx
import { useState } from "react";
import { GitCommitHorizontal } from "lucide-react";
import { useFontScale } from "../contexts/FontSizeContext";
import useGitStatus from "../hooks/useGitStatus";

export default function GitStatusPill({ cwd }) {
  const s = useFontScale();
  const { status } = useGitStatus(cwd);
  const [open, setOpen] = useState(false);

  if (!status) return null;

  const dirty = status.files.length;
  const { ahead, behind, detached, upstream } = status;
  const clean = dirty === 0 && ahead === 0 && behind === 0;

  return (
    <button
      onClick={() => setOpen((v) => !v)}
      title={
        detached ? "Detached HEAD" :
        !upstream ? "No upstream configured" :
        clean ? "Clean & in sync" :
        `${dirty} changed · ${ahead} ahead · ${behind} behind`
      }
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        height: 23,
        padding: "0 8px",
        borderRadius: 7,
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.06)",
        color: "rgba(255,255,255,0.6)",
        fontSize: s(11),
        fontFamily: "'JetBrains Mono',monospace",
        letterSpacing: ".04em",
        cursor: "pointer",
        transition: "all .15s",
      }}
    >
      <GitCommitHorizontal size={13} strokeWidth={1.6} />
      {detached ? (
        <span style={{ color: "rgba(200,160,100,0.8)" }}>detached</span>
      ) : !upstream ? (
        <span style={{ color: "rgba(255,255,255,0.4)" }}>local</span>
      ) : clean ? (
        <span style={{ color: "rgba(255,255,255,0.35)" }}>GIT</span>
      ) : (
        <>
          {dirty > 0 && <span style={{ color: "rgba(240,180,90,0.9)" }}>●{dirty}</span>}
          {ahead > 0 && <span style={{ color: "rgba(255,255,255,0.85)" }}>↑{ahead}</span>}
          {behind > 0 && <span style={{ color: "rgba(150,190,255,0.9)" }}>↓{behind}</span>}
        </>
      )}
    </button>
  );
}
```

**Step 2: Lint**

Run: `npm run lint`
Expected: passes.

**Step 3: Commit**

```bash
git add src/components/GitStatusPill.jsx
git commit -m "feat(git): add GitStatusPill component (pill only) (#57)"
```

---

### Task 7: Mount GitStatusPill in ChatArea

**Files:**
- Modify: `src/components/ChatArea.jsx` (insert import + mount)

**Step 1: Import the pill**

Add to the import block near `import BranchSelector from "./BranchSelector";` (line 7):

```jsx
import GitStatusPill  from "./GitStatusPill";
```

**Step 2: Mount next to BranchSelector**

At `ChatArea.jsx:288-295`, change:

```jsx
{!showNewChatCard && (
  <BranchSelector
    cwd={cwd}
    onCwdChange={onCwdChange}
    hasMessages={convo?.msgs?.length > 0}
    onRefocusTerminal={onRefocusTerminal}
  />
)}
```

to:

```jsx
{!showNewChatCard && <GitStatusPill cwd={cwd} />}
{!showNewChatCard && (
  <BranchSelector
    cwd={cwd}
    onCwdChange={onCwdChange}
    hasMessages={convo?.msgs?.length > 0}
    onRefocusTerminal={onRefocusTerminal}
  />
)}
```

**Step 3: Lint**

Run: `npm run lint`
Expected: passes.

**Step 4: Smoke test**

Restart dev app with an active conversation in a git repo. Expect the pill visible next to BranchSelector showing `GIT` when clean, `●N` when dirty after editing a file. In a detached HEAD (`git checkout <sha>`), pill shows `detached`.

**Step 5: Commit**

```bash
git add src/components/ChatArea.jsx
git commit -m "feat(git): mount GitStatusPill in chat top-bar (#57)"
```

---

### Task 8: Add popover to GitStatusPill

**Files:**
- Modify: `src/components/GitStatusPill.jsx`

**Step 1: Replace the file with popover-enabled version**

```jsx
import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { GitCommitHorizontal, Sparkles, X } from "lucide-react";
import { useFontScale } from "../contexts/FontSizeContext";
import useGitStatus from "../hooks/useGitStatus";

const MENU_GAP = 6;
const VIEWPORT_PADDING = 8;
const MENU_WIDTH = 360;

function statusLetter(idx, wt) {
  if (idx === "?" ) return "?" ;
  if (idx === "A" || wt === "A") return "A";
  if (idx === "D" || wt === "D") return "D";
  if (idx === "R" || wt === "R") return "R";
  return "M";
}

export default function GitStatusPill({ cwd }) {
  const s = useFontScale();
  const { status, refresh, refetch } = useGitStatus(cwd);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [generating, setGenerating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const [menuStyle, setMenuStyle] = useState(null);

  const close = useCallback(() => {
    setOpen(false);
    setMenuStyle(null);
    setError(null);
  }, []);

  useEffect(() => {
    if (!open) return;
    setError(null);
    refresh();
    refetch();
  }, [open, refresh, refetch]);

  useEffect(() => {
    if (!open) return;
    const h = (e) => {
      if (triggerRef.current?.contains(e.target)) return;
      if (menuRef.current?.contains(e.target)) return;
      close();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open, close]);

  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const alignRight = rect.left + MENU_WIDTH > window.innerWidth - VIEWPORT_PADDING;
    const left = alignRight
      ? Math.max(VIEWPORT_PADDING, rect.right - MENU_WIDTH)
      : Math.min(rect.left, window.innerWidth - MENU_WIDTH - VIEWPORT_PADDING);
    setMenuStyle({ top: rect.bottom + MENU_GAP, left, width: MENU_WIDTH });
  }, [open]);

  if (!status) return null;

  const dirty = status.files.length;
  const { ahead, behind, detached, upstream, branch } = status;
  const clean = dirty === 0 && ahead === 0 && behind === 0;
  const canPush = !detached && upstream;
  const canPull = !detached && upstream && behind > 0;
  const canCommit = !detached && dirty > 0 && message.trim().length > 0 && !busy;

  const handleGenerate = async () => {
    if (generating || !window.api?.gitGenerateCommitMessage) return;
    setGenerating(true);
    try {
      const { message: msg } = await window.api.gitGenerateCommitMessage(cwd);
      if (msg) setMessage(msg);
      else setError("Couldn't generate a message.");
    } finally {
      setGenerating(false);
    }
  };

  const handleCommitAndPush = async () => {
    if (!canCommit) return;
    setBusy(true);
    setError(null);
    try {
      const c = await window.api.gitCommit(cwd, message.trim());
      if (!c.ok) { setError(c.stderr || "Commit failed"); return; }
      setMessage("");
      if (canPush) {
        const p = await window.api.gitPush(cwd);
        if (!p.ok) { setError(p.stderr || "Push failed"); return; }
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const handlePull = async () => {
    if (!canPull) return;
    setBusy(true);
    setError(null);
    try {
      const p = await window.api.gitPull(cwd);
      if (!p.ok) setError(p.stderr || "Pull failed");
      else await refresh();
    } finally {
      setBusy(false);
    }
  };

  const popover = open && menuStyle ? createPortal(
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        top: menuStyle.top,
        left: menuStyle.left,
        width: menuStyle.width,
        background: "rgba(14,14,14,0.98)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 10,
        boxShadow: "0 12px 36px rgba(0,0,0,0.6)",
        backdropFilter: "blur(24px) saturate(1.1)",
        color: "rgba(255,255,255,0.85)",
        fontFamily: "system-ui, sans-serif",
        fontSize: s(12),
        zIndex: 9999,
        overflow: "hidden",
      }}
    >
      {/* header */}
      <div style={{
        padding: "10px 12px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        fontFamily: "'JetBrains Mono',monospace",
        fontSize: s(11),
      }}>
        <span style={{ color: "rgba(255,255,255,0.7)" }}>
          {branch || (detached ? "(detached)" : "?")}
          {upstream && <span style={{ color: "rgba(255,255,255,0.3)" }}> → {upstream}</span>}
        </span>
        <span style={{ color: "rgba(255,255,255,0.4)" }}>
          ↑{ahead} ↓{behind}
        </span>
      </div>

      {/* file list */}
      <div style={{ padding: "8px 12px", maxHeight: 200, overflowY: "auto" }}>
        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: s(10), fontFamily: "'JetBrains Mono',monospace", letterSpacing: ".08em", marginBottom: 6 }}>
          {clean ? "NO CHANGES" : `CHANGED FILES (${dirty})`}
        </div>
        {status.files.map((f) => (
          <div key={f.path} style={{
            display: "flex", gap: 8, alignItems: "center",
            fontFamily: "'JetBrains Mono',monospace", fontSize: s(11),
            padding: "2px 0", color: "rgba(255,255,255,0.7)",
          }}>
            <span style={{ width: 14, color: "rgba(240,180,90,0.8)" }}>{statusLetter(f.index, f.worktree)}</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{f.path}</span>
          </div>
        ))}
      </div>

      {/* commit message */}
      {!detached && (
        <div style={{ padding: "8px 12px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
            <textarea
              placeholder="Commit message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={2}
              style={{
                flex: 1,
                resize: "none",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 6,
                color: "rgba(255,255,255,0.9)",
                fontFamily: "system-ui,sans-serif",
                fontSize: s(12),
                padding: "6px 8px",
                outline: "none",
              }}
            />
            <button
              onClick={handleGenerate}
              disabled={generating || dirty === 0}
              title="Generate commit message with Claude"
              style={{
                display: "flex", alignItems: "center", gap: 4,
                height: 28, padding: "0 8px",
                borderRadius: 6,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: generating ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.7)",
                fontSize: s(11),
                fontFamily: "'JetBrains Mono',monospace",
                cursor: generating || dirty === 0 ? "default" : "pointer",
                opacity: dirty === 0 ? 0.4 : 1,
              }}
            >
              <Sparkles size={12} strokeWidth={1.6} />
              {generating ? "…" : "GEN"}
            </button>
          </div>
        </div>
      )}

      {/* action buttons */}
      <div style={{ padding: "8px 12px", display: "flex", gap: 8, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <button
          onClick={handleCommitAndPush}
          disabled={!canCommit}
          style={{
            flex: 1,
            height: 30,
            background: canCommit ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)",
            border: "1px solid " + (canCommit ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.05)"),
            borderRadius: 6,
            color: canCommit ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.3)",
            fontSize: s(12),
            fontFamily: "system-ui,sans-serif",
            cursor: canCommit ? "pointer" : "default",
            transition: "all .15s",
          }}
        >
          {busy ? "…" : "Commit & Push"}
        </button>
        <button
          onClick={handlePull}
          disabled={!canPull || busy}
          style={{
            height: 30,
            padding: "0 14px",
            background: canPull ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.03)",
            border: "1px solid " + (canPull ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.05)"),
            borderRadius: 6,
            color: canPull ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.3)",
            fontSize: s(12),
            fontFamily: "system-ui,sans-serif",
            cursor: canPull && !busy ? "pointer" : "default",
          }}
        >
          Pull
        </button>
      </div>

      {error && (
        <div style={{
          padding: "8px 12px",
          background: "rgba(200,80,80,0.08)",
          borderTop: "1px solid rgba(200,80,80,0.2)",
          color: "rgba(255,180,180,0.9)",
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: s(11),
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
        }}>
          <span style={{ flex: 1, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{error}</span>
          <button onClick={() => setError(null)} style={{ background: "none", border: "none", color: "rgba(255,180,180,0.9)", cursor: "pointer", padding: 0 }}>
            <X size={12} />
          </button>
        </div>
      )}
    </div>,
    document.body,
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        title={
          detached ? "Detached HEAD" :
          !upstream ? "No upstream configured" :
          clean ? "Clean & in sync" :
          `${dirty} changed · ${ahead} ahead · ${behind} behind`
        }
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          height: 23,
          padding: "0 8px",
          borderRadius: 7,
          background: open ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.04)",
          border: "1px solid " + (open ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)"),
          color: "rgba(255,255,255,0.6)",
          fontSize: s(11),
          fontFamily: "'JetBrains Mono',monospace",
          letterSpacing: ".04em",
          cursor: "pointer",
          transition: "all .15s",
        }}
      >
        <GitCommitHorizontal size={13} strokeWidth={1.6} />
        {detached ? (
          <span style={{ color: "rgba(200,160,100,0.8)" }}>detached</span>
        ) : !upstream ? (
          <span style={{ color: "rgba(255,255,255,0.4)" }}>local</span>
        ) : clean ? (
          <span style={{ color: "rgba(255,255,255,0.35)" }}>GIT</span>
        ) : (
          <>
            {dirty > 0 && <span style={{ color: "rgba(240,180,90,0.9)" }}>●{dirty}</span>}
            {ahead > 0 && <span style={{ color: "rgba(255,255,255,0.85)" }}>↑{ahead}</span>}
            {behind > 0 && <span style={{ color: "rgba(150,190,255,0.9)" }}>↓{behind}</span>}
          </>
        )}
      </button>
      {popover}
    </>
  );
}
```

**Step 2: Lint**

Run: `npm run lint`
Expected: passes.

**Step 3: Manual QA checklist**

Start `npm run dev`. With a git repo active in a conversation:

1. Clean state: pill shows `GIT`. Click → popover "NO CHANGES", commit disabled, Pull disabled.
2. Edit a file. Within 10s pill shows `●1`. Click → file appears in list.
3. Type a message, click "Commit & Push" → file disappears from list, pill clears `●`. Counter `↑` may show briefly then clear after push.
4. Click "GEN" with dirty state → textarea populates within a few seconds.
5. Force a remote change on the repo (e.g. push from another clone). Within ~60s pill shows `↓1`. Click Pull → it clears.
6. Detach HEAD (`git checkout <sha>`) → pill shows `detached`; commit/push/pull disabled.
7. Repo with no remote → pill shows `local`; push/pull disabled.

**Step 4: Commit**

```bash
git add src/components/GitStatusPill.jsx
git commit -m "feat(git): add commit popover with AI message generation (#57)"
```

---

### Task 9: Final polish pass

**Files:**
- Potentially: `src/components/GitStatusPill.jsx`

**Step 1: Review against design**

Re-read `docs/plans/2026-04-17-git-commit-view-design.md`. Confirm:
- [ ] Pill states match spec (clean / dirty / behind / ahead / detached / local).
- [ ] Popover opens → auto-fetch + auto-refresh.
- [ ] Commit & Push + Pull buttons present and gated correctly.
- [ ] AI Generate button present.
- [ ] Error strip dismissible.

**Step 2: Visual polish**

Run the app, compare pill vs. `BranchSelector` and `ModelPicker` for vertical alignment, padding, color weight. Adjust `GitStatusPill.jsx` as needed.

**Step 3: Lint + final smoke**

Run: `npm run lint`
Run through the Task 8 Step 3 QA checklist once more end-to-end.

**Step 4: Commit (if changes)**

```bash
git add src/components/GitStatusPill.jsx
git commit -m "polish(git): align GitStatusPill with sibling top-bar controls (#57)"
```

---

## Out of scope (explicitly)

- Per-file staging (always `git add -A`).
- Diff viewer / preview.
- Conflict resolution UI (terminal handles it).
- Remote creation / upstream configuration (uses `push -u origin <branch>` fallback only).
