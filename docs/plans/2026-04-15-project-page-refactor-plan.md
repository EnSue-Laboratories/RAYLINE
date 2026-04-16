# GitHub Project Page Refactor — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix three UX issues in the GitHub Project Manager's create form: searchable branch selectors, smart branch defaults, image paste support, and optional PR description.

**Architecture:** All GitHub operations go through `electron/github-manager.cjs` (runs `gh` CLI) → IPC via `electron/main.cjs` → exposed on `window.ghApi` via `electron/preload-pm.cjs`. The create form is `src/pm-components/CreateForm.jsx`. We add a new `SearchableSelect` component, three new backend methods, and fix one existing method.

**Tech Stack:** React (no TypeScript), Electron IPC, `gh` CLI, inline styles (no CSS framework)

---

### Task 1: Fix PR description optional bug

The simplest fix — `createPR` currently skips `--body` when body is empty, causing `gh pr create` to open an interactive editor that hangs.

**Files:**
- Modify: `electron/github-manager.cjs:191-203`

**Step 1: Fix createPR to always pass --body**

In `electron/github-manager.cjs`, replace lines 191-203:

```js
async function createPR(repo, title, body, head, base) {
  const args = [
    "pr", "create",
    "-R", repo,
    "--title", title,
    "--head", head,
    "--base", base || "main",
    "--body", body || "",
  ];
  const raw = await gh(args);
  // gh pr create outputs the PR URL, not JSON
  return { url: raw };
}
```

The key change: `args.push("--body", body || "")` is now always included instead of conditionally with `if (body)`.

**Step 2: Commit**

```bash
git add electron/github-manager.cjs
git commit -m "fix: always pass --body to gh pr create to prevent interactive editor hang"
```

---

### Task 2: Add backend methods for current branch and repo default branch

**Files:**
- Modify: `electron/github-manager.cjs` (add two functions + exports)
- Modify: `electron/main.cjs:562` (add two IPC handlers)
- Modify: `electron/preload-pm.cjs` (add two methods)

**Step 1: Add getCurrentBranch to github-manager.cjs**

Add after the `listBranches` function (after line 208):

```js
async function getCurrentBranch() {
  try {
    const raw = await new Promise((resolve, reject) => {
      execFile("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
        timeout: 5000,
      }, (err, stdout) => {
        if (err) reject(err);
        else resolve(stdout.trim());
      });
    });
    return raw;
  } catch {
    return null;
  }
}
```

Note: This runs in `process.cwd()` (Electron's working directory = project root). It does NOT use the `gh()` helper because this is a plain git command, not a gh CLI command.

**Step 2: Add getRepoDefaultBranch to github-manager.cjs**

Add right after `getCurrentBranch`:

```js
async function getRepoDefaultBranch(repo) {
  try {
    const raw = await gh(["api", `/repos/${repo}`, "--jq", ".default_branch"]);
    return raw || "main";
  } catch {
    return "main";
  }
}
```

**Step 3: Export both from github-manager.cjs**

Add `getCurrentBranch` and `getRepoDefaultBranch` to the `module.exports` object at line 236.

**Step 4: Wire IPC in main.cjs**

Add after line 562 (`gh-linked-prs` handler):

```js
ipcMain.handle("gh-current-branch", () => ghManager.getCurrentBranch());
ipcMain.handle("gh-repo-default-branch", (_e, repo) => ghManager.getRepoDefaultBranch(repo));
```

**Step 5: Expose in preload-pm.cjs**

Add two new entries to the `ghApi` object (before `loadPmState`):

```js
getCurrentBranch: () => ipcRenderer.invoke("gh-current-branch"),
getRepoDefaultBranch: (repo) => ipcRenderer.invoke("gh-repo-default-branch", repo),
```

**Step 6: Commit**

```bash
git add electron/github-manager.cjs electron/main.cjs electron/preload-pm.cjs
git commit -m "feat: add getCurrentBranch and getRepoDefaultBranch backend APIs"
```

---

### Task 3: Create SearchableSelect component

**Files:**
- Create: `src/pm-components/SearchableSelect.jsx`

**Step 1: Create the component**

Create `src/pm-components/SearchableSelect.jsx`:

```jsx
import { useState, useRef, useEffect } from "react";

const inputStyle = {
  width: "100%",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 6,
  padding: "8px 10px",
  color: "rgba(255,255,255,0.8)",
  fontSize: 13,
  fontFamily: "system-ui, sans-serif",
  boxSizing: "border-box",
};

export default function SearchableSelect({ options, value, onChange, placeholder }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const containerRef = useRef(null);
  const listRef = useRef(null);

  const filtered = query
    ? options.filter((o) => o.toLowerCase().includes(query.toLowerCase()))
    : options;

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Reset highlight when filtered list changes
  useEffect(() => {
    setHighlightIdx(0);
  }, [filtered.length]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (open && listRef.current) {
      const el = listRef.current.children[highlightIdx];
      if (el) el.scrollIntoView({ block: "nearest" });
    }
  }, [highlightIdx, open]);

  const select = (val) => {
    onChange(val);
    setQuery("");
    setOpen(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[highlightIdx]) select(filtered[highlightIdx]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  };

  return (
    <div ref={containerRef} style={{ position: "relative", marginTop: 4 }}>
      <input
        type="text"
        value={open ? query : value}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder || "Search..."}
        style={inputStyle}
      />
      {open && filtered.length > 0 && (
        <div
          ref={listRef}
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            marginTop: 2,
            maxHeight: 180,
            overflowY: "auto",
            background: "rgba(30,30,30,0.98)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 6,
            zIndex: 50,
          }}
        >
          {filtered.map((opt, i) => (
            <div
              key={opt}
              onMouseDown={(e) => { e.preventDefault(); select(opt); }}
              onMouseEnter={() => setHighlightIdx(i)}
              style={{
                padding: "6px 10px",
                fontSize: 13,
                fontFamily: "system-ui, sans-serif",
                color: opt === value ? "rgba(180,220,255,0.9)" : "rgba(255,255,255,0.7)",
                background: i === highlightIdx ? "rgba(255,255,255,0.06)" : "transparent",
                cursor: "pointer",
              }}
            >
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/pm-components/SearchableSelect.jsx
git commit -m "feat: add SearchableSelect combobox component"
```

---

### Task 4: Integrate SearchableSelect and smart defaults into CreateForm

**Files:**
- Modify: `src/pm-components/CreateForm.jsx`

**Step 1: Add import**

At line 2 (after the X import), add:

```jsx
import SearchableSelect from "./SearchableSelect";
```

**Step 2: Update the useEffect for branch loading**

Replace the existing useEffect (lines 38-45) with logic that also fetches the current branch and repo default branch:

```jsx
useEffect(() => {
  if (type === "pr" && repo) {
    Promise.all([
      window.ghApi.listBranches(repo),
      window.ghApi.getCurrentBranch(),
      window.ghApi.getRepoDefaultBranch(repo),
    ]).then(([b, currentBranch, defaultBranch]) => {
      const branchNames = b.map((br) => br.name);
      setBranches(b);
      if (!head) {
        const match = branchNames.find((n) => n === currentBranch);
        setHead(match || branchNames[0] || "");
      }
      setBase(defaultBranch);
    }).catch(() => {});
  }
}, [repo, type]);
```

**Step 3: Replace HEAD and BASE `<select>` with SearchableSelect**

Replace the branch selectors block (lines 106-129) with:

```jsx
{type === "pr" && (
  <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
    <div style={{ flex: 1 }}>
      <label style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", fontFamily: "'JetBrains Mono', monospace", letterSpacing: ".04em" }}>HEAD</label>
      <SearchableSelect
        options={branches.map((b) => b.name)}
        value={head}
        onChange={setHead}
        placeholder="Search branches..."
      />
    </div>
    <div style={{ flex: 1 }}>
      <label style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", fontFamily: "'JetBrains Mono', monospace", letterSpacing: ".04em" }}>BASE</label>
      <SearchableSelect
        options={branches.map((b) => b.name)}
        value={base}
        onChange={setBase}
        placeholder="Search branches..."
      />
    </div>
  </div>
)}
```

**Step 4: Remove the now-unused `selectStyle` import**

The `selectStyle` constant (lines 16-26) is still used by the repo `<select>`. Keep it. But remove the unused `appearance` and `backgroundImage` stuff only if the repo selector also gets converted (it doesn't in this plan, so keep `selectStyle` as-is).

**Step 5: Commit**

```bash
git add src/pm-components/CreateForm.jsx
git commit -m "feat: use searchable branch selectors with smart defaults in PR create form"
```

---

### Task 5: Add image paste support to description textarea

**Files:**
- Modify: `electron/github-manager.cjs` (add `uploadImage`)
- Modify: `electron/main.cjs` (add IPC handler)
- Modify: `electron/preload-pm.cjs` (expose method)
- Modify: `src/pm-components/CreateForm.jsx` (paste handler + preview + submit logic)

**Step 1: Add uploadImage to github-manager.cjs**

Add after `getRepoDefaultBranch`:

```js
async function uploadImage(repo, base64Data, filename) {
  // GitHub doesn't have a direct image upload API for issues/PRs.
  // Use the repository's issue attachment workaround via gh CLI:
  // Create a temporary file, then use gh to create an issue comment draft
  // that triggers the upload. Alternative: use the Markdown image upload
  // endpoint that GitHub web uses.
  const fs = require("fs");
  const os = require("os");
  const path = require("path");

  const tmpPath = path.join(os.tmpdir(), filename);
  const buffer = Buffer.from(base64Data, "base64");
  fs.writeFileSync(tmpPath, buffer);

  try {
    // gh issue/pr create supports file attachments via the body
    // But the cleanest approach is using the user-content upload API
    // that GitHub's web editor uses. We'll use a simpler approach:
    // create a gist with the image and reference it.
    // Actually — the simplest reliable approach: just inline the base64 as
    // a data URL in markdown. GitHub will render it in previews.
    // For proper hosting, we'd need the undocumented upload endpoint.
    // Return a markdown image with data URL for now.
    const dataUrl = `data:image/png;base64,${base64Data}`;
    return { url: dataUrl, markdown: `![${filename}](${dataUrl})` };
  } finally {
    try { fs.unlinkSync(tmpPath); } catch {}
  }
}
```

Note: GitHub's image upload API for issues is undocumented. For a v1, we embed as base64 data URLs which work in the GitHub API body. If images are large, a future iteration could upload to a gist or use the `uploads.github.com` endpoint.

**Step 2: Export uploadImage and wire IPC**

Add `uploadImage` to `module.exports` in `github-manager.cjs`.

Add to `main.cjs` after the other new handlers:

```js
ipcMain.handle("gh-upload-image", (_e, repo, base64Data, filename) => ghManager.uploadImage(repo, base64Data, filename));
```

Add to `preload-pm.cjs`:

```js
uploadImage: (repo, base64Data, filename) => ipcRenderer.invoke("gh-upload-image", repo, base64Data, filename),
```

**Step 3: Add paste handler and image state to CreateForm**

Add state for images after the existing state declarations (around line 36):

```jsx
const [images, setImages] = useState([]);
```

Add the paste handler function before `handleSubmit`:

```jsx
const handlePaste = (e) => {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith("image/")) {
      e.preventDefault();
      const file = item.getAsFile();
      const reader = new FileReader();
      reader.onload = (ev) => {
        setImages((prev) => [...prev, {
          name: file.name || `image-${Date.now()}.png`,
          dataUrl: ev.target.result,
        }]);
      };
      reader.readAsDataURL(file);
    }
  }
};
```

**Step 4: Update handleSubmit to include images in body**

Replace the `handleSubmit` function to append image markdown to the body before submission:

```jsx
const handleSubmit = async () => {
  if (!title.trim() || submitting) return;
  setSubmitting(true);
  setError(null);
  try {
    let finalBody = body.trim();
    // Append pasted images as markdown
    for (const img of images) {
      const base64 = img.dataUrl.split(",")[1];
      const result = await window.ghApi.uploadImage(repo, base64, img.name);
      finalBody += (finalBody ? "\n\n" : "") + result.markdown;
    }
    if (type === "issue") {
      await window.ghApi.createIssue(repo, title.trim(), finalBody);
    } else {
      await window.ghApi.createPR(repo, title.trim(), finalBody, head, base);
    }
    onClose();
    setTimeout(() => onCreated(), 500);
  } catch (e) {
    setError(e.message);
  }
  setSubmitting(false);
};
```

**Step 5: Add onPaste to the textarea and image preview below it**

On the textarea element, add `onPaste={handlePaste}`.

After the textarea's closing `</div>` (around line 154), add image preview:

```jsx
{images.length > 0 && (
  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
    {images.map((img, i) => (
      <div key={i} style={{ position: "relative" }}>
        <img src={img.dataUrl} alt={img.name} style={{ height: 48, maxWidth: 80, borderRadius: 4, border: "1px solid rgba(255,255,255,0.08)" }} />
        <button
          onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
          style={{
            position: "absolute", top: -4, right: -4, width: 16, height: 16,
            borderRadius: "50%", background: "rgba(0,0,0,0.8)", border: "1px solid rgba(255,255,255,0.15)",
            color: "rgba(255,255,255,0.6)", fontSize: 10, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
          }}
        >
          x
        </button>
      </div>
    ))}
  </div>
)}
```

**Step 6: Commit**

```bash
git add electron/github-manager.cjs electron/main.cjs electron/preload-pm.cjs src/pm-components/CreateForm.jsx
git commit -m "feat: add image paste support to issue/PR create form"
```

---

### Task 6: Manual QA test

**Step 1:** Start the dev server and open the GitHub Projects window.

**Step 2:** Test PR creation:
- Click "New Pull Request"
- Verify HEAD defaults to the currently checked-out branch
- Verify BASE defaults to the repo's default branch
- Type in the branch search box — verify it filters
- Use arrow keys + Enter to select a branch
- Submit with empty description — verify no hang

**Step 3:** Test image paste:
- Copy an image to clipboard
- Paste in the description textarea
- Verify preview appears
- Click X to remove it
- Submit and verify the image appears in the created issue/PR

**Step 4:** Test issue creation:
- Create an issue with and without description
- Verify both work
