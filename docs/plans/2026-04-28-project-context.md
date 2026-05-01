# Per-Project Context Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let users attach a free-form context string to each project; that string is automatically appended to Claude's system prompt for any chat spawned with that project's `cwd`.

**Architecture:** Store `context: string` on the existing project meta object in `App.jsx`. Edit it via a modal opened from the project row's "..." menu. Capture an initial value when creating a new project. Pass the current value through the existing `agent-start` IPC payload; in `electron/agent-manager.cjs` concatenate it into the existing `--append-system-prompt` string when non-empty.

**Tech Stack:** React 19, Electron, native `--append-system-prompt` Claude CLI flag.

**Repo conventions:**
- No automated test suite. Verification per task = `npm run lint` plus manual checks in `npm run dev:electron`.
- Conventional Commit prefixes (feat, fix, refactor, chore, docs).
- No emojis in code or commit messages.

**Design doc:** [`2026-04-28-project-context-design.md`](./2026-04-28-project-context-design.md)

---

## Task 1: Wire `projectContext` through `agent-manager.cjs`

**Files:**
- Modify: `electron/agent-manager.cjs:88-171, 238` — accept and apply the new field.

**Step 1: Read the current `--append-system-prompt` block**

Read `electron/agent-manager.cjs` lines 77-200. Confirm the `--append-system-prompt` argument is built as a single template literal in `buildClaudeArgs`.

**Step 2: Add `projectContext` to `buildClaudeArgs` signature**

Change the function signature on line 77 from:

```js
function buildClaudeArgs({ model, sessionId, resumeSessionId, forkSession }) {
```

to:

```js
function buildClaudeArgs({ model, sessionId, resumeSessionId, forkSession, projectContext }) {
```

**Step 3: Concatenate project context into the system prompt**

Immediately after the existing `args.push("--append-system-prompt", \`...\`)` call (ends near line 171), replace the single push with a `let basePrompt = \`...\`` assignment and a follow-up block:

```js
let appendPrompt = `You are running inside RayLine, ...`; // existing content unchanged

const trimmedProjectContext = typeof projectContext === "string" ? projectContext.trim() : "";
if (trimmedProjectContext) {
  appendPrompt += `\n\nPROJECT CONTEXT (set in RayLine for this project):\n${trimmedProjectContext}`;
}

args.push("--append-system-prompt", appendPrompt);
```

**Step 4: Forward `projectContext` from `startAgent`**

In `startAgent` (line 238), update the destructuring to include `projectContext` and pass it into the `buildClaudeArgs` call. Search for every `buildClaudeArgs({ ... })` invocation in this file and add `projectContext` to each.

**Step 5: Lint**

Run: `npm run lint`
Expected: passes (no new warnings).

**Step 6: Commit**

```bash
git add electron/agent-manager.cjs
git commit -m "feat(agent): accept projectContext and append to system prompt"
```

---

## Task 2: Pass `projectContext` through preload + main IPC

**Files:**
- Modify: `electron/main.cjs:803-818, 830-838` — forward field on `agent-start` and `agent-edit-resend`.

`preload.cjs` and `main.cjs` already pass arbitrary fields through (`opts` is spread). No code change is strictly required, but verify by inspection.

**Step 1: Inspect IPC paths**

Read `electron/preload.cjs:19-21` and confirm `agentStart` / `agentEditAndResend` send the entire `opts` object verbatim. Read `electron/main.cjs:803-838` and confirm both handlers spread `opts` into `startAgent`. No code change needed.

**Step 2: Commit (no-op)**

Skip the commit — Task 1's changes already propagate via the spread. Move to Task 3.

---

## Task 3: Thread `projectContext` through `useAgent.js`

**Files:**
- Modify: `src/hooks/useAgent.js:1272-1288, 1312-1360` — accept `projectContext` and forward to IPC.

**Step 1: Add `projectContext` to `startPreparedMessage`**

On line 1272, extend the destructured argument list to include `projectContext` (place after `cwd`):

```js
const startPreparedMessage = useCallback(({ conversationId, pendingId, sessionId, prompt, model, provider, effort, thinking, openCodeConfig, cwd, projectContext, images, files, resumeSessionId, forkSession, multicaContext, multicaToken }) => {
```

In the `payload` object on line 1280, include `projectContext`:

```js
const payload = { conversationId, sessionId, prompt, model, provider, effort, thinking, openCodeConfig, cwd, projectContext, images, files, resumeSessionId, forkSession };
```

**Step 2: Add `projectContext` to `editAndResend`**

On line 1312, extend the destructured argument list to include `projectContext`:

```js
const editAndResend = useCallback(({ conversationId, sessionId, messageIndex, newText, wirePrompt, model, provider, effort, thinking, openCodeConfig, cwd, projectContext, multicaContext, multicaToken }) => {
```

In both `agentStart` (multica branch) and `agentEditAndResend` payloads further down (around lines 1327 and 1341), include `projectContext`. Read the surrounding lines and add the field next to `cwd` in each payload object.

**Step 3: Lint**

Run: `npm run lint`
Expected: passes.

**Step 4: Commit**

```bash
git add src/hooks/useAgent.js
git commit -m "feat(useAgent): forward projectContext to agent IPC"
```

---

## Task 4: Resolve and pass `projectContext` from `App.jsx`

**Files:**
- Modify: `src/App.jsx` — at the two call sites of `startPreparedMessage` and `editAndResend` (around lines 2831, 3422), look up the project context for the chat's cwd and pass it.

**Step 1: Add a helper inside the App component**

Near other small helpers (top of the App component body, or alongside other `useCallback`s that already close over `projects`), add:

```js
const resolveProjectContext = useCallback((cwdPath) => {
  if (!cwdPath) return undefined;
  const root = getMainRepoRoot(cwdPath);
  if (!root) return undefined;
  const ctx = projects?.[root]?.context;
  return typeof ctx === "string" && ctx.trim() ? ctx : undefined;
}, [projects]);
```

Place this helper inline where existing project-meta helpers live. If unsure, search for `getMainRepoRoot(` usages near the `setProjects` calls and add adjacent.

**Step 2: Pass it at the `startPreparedMessage` call site**

Locate the call at `src/App.jsx:2831`. Add `projectContext: resolveProjectContext(effectiveCwd),` immediately after the `cwd: effectiveCwd,` line.

Add `resolveProjectContext` to the dependency array of the surrounding `useCallback` (line 2893).

**Step 3: Pass it at the `editAndResend` call site**

Locate the call at `src/App.jsx:3422`. Add `projectContext: resolveProjectContext(<the cwd variable used here>),` next to the existing `cwd:` line. Read 20 lines around the call to identify the cwd variable name (likely `effectiveCwd` or `cwd`).

Add `resolveProjectContext` to the dependency array of the surrounding `useCallback` (line 3466).

**Step 4: Lint**

Run: `npm run lint`
Expected: passes; no missing-dep warnings on the touched callbacks.

**Step 5: Manual smoke test**

Run: `npm run dev:electron`
- Open an existing chat with a project cwd.
- Send any message.
- In the existing repo, attach a temporary `console.log` near `appendPrompt` in `agent-manager.cjs` (revert before commit) OR run `ps -ef | grep claude` while a chat is mid-flight to inspect args.
- Confirm `--append-system-prompt` does NOT yet contain a "PROJECT CONTEXT" block (because no project has a context value set yet — that comes in later tasks).

**Step 6: Commit**

```bash
git add src/App.jsx
git commit -m "feat(app): resolve project context per cwd and pass to agent"
```

---

## Task 5: Build `ProjectContextModal` component

**Files:**
- Create: `src/components/ProjectContextModal.jsx`

**Step 1: Create the file**

Model the styling on `src/components/NewProjectModal.jsx` (same backdrop / card / footer layout). The component takes:

```js
export default function ProjectContextModal({ open, projectName, initialValue, onClose, onSave })
```

Behavior:
- Local state `value` initialized from `initialValue` whenever `open` flips to true.
- Multi-line `<textarea>` (rows=10, monospace, fills width).
- Footer: `Cancel` and `Save` buttons. `Save` calls `onSave(value)` then `onClose()`.
- Pressing `Escape` closes; clicking the backdrop closes; `Cmd/Ctrl+Enter` saves.
- A short hint above the textarea: `"Appended to the system prompt for every chat in this project."`
- Title row reads: `Project context — {projectName}`.

Reuse the `inputStyle` / `secondaryBtnStyle` / `primaryBtnStyle` patterns from `NewProjectModal`. Render through `createPortal(..., document.body)`.

**Step 2: Lint**

Run: `npm run lint`
Expected: passes.

**Step 3: Commit**

```bash
git add src/components/ProjectContextModal.jsx
git commit -m "feat(components): add ProjectContextModal"
```

---

## Task 6: Wire modal into the project "..." menu

**Files:**
- Modify: `src/components/ProjectGroup.jsx:14-22, 219-271`
- Modify: `src/App.jsx` — pass new prop and handler.

**Step 1: Add `onEditContext` prop to `ProjectGroup`**

Update `ProjectGroup`'s props (line 14) to include `onEditContext`. Forward it through the existing `memo` equality check (`areProjectGroupsEqual`, line 622) — add an `onEditContext` reference comparison.

**Step 2: Add modal state inside `ProjectGroup`**

Near the existing `useState` calls, add:

```js
const [contextModalOpen, setContextModalOpen] = useState(false);
```

Import the new component at the top of the file:

```js
import ProjectContextModal from "./ProjectContextModal";
```

**Step 3: Add the menu item**

In the menu portal block (around line 239), insert above the `Open in Finder` `MenuBtn`:

```jsx
<MenuBtn
  s={s}
  label="Edit context…"
  onClick={() => {
    setContextModalOpen(true);
    closeMenu();
  }}
/>
```

**Step 4: Render the modal**

After the menu portal block, render:

```jsx
<ProjectContextModal
  open={contextModalOpen}
  projectName={project.name}
  initialValue={project.context || ""}
  onClose={() => setContextModalOpen(false)}
  onSave={(value) => onEditContext(project.cwdRoot, value)}
/>
```

**Step 5: Add `handleEditProjectContext` in `App.jsx`**

Adjacent to `handleHideProject` (around `src/App.jsx:2203`), add:

```js
const handleEditProjectContext = useCallback((cwdRoot, context) => {
  const projectRoot = getMainRepoRoot(cwdRoot);
  setProjects((prev) => ({
    ...prev,
    [projectRoot]: { ...prev[projectRoot], context: context || "" },
  }));
}, []);
```

Pass it as `onEditContext={handleEditProjectContext}` to every `<ProjectGroup ... />` render. Search for `<ProjectGroup` in `src/components/Sidebar.jsx` and any other call site, and thread the prop through.

**Step 6: Pass `project.context` through the project-shape mapper**

Find where `projects` state is reshaped into the array of `project` objects passed to `ProjectGroup` (search for `convos:` or `latestTs:` near a `cwdRoot` field — likely in `App.jsx` or `Sidebar.jsx`). Add `context: meta.context || ""` (or equivalent) so the modal sees the current value.

**Step 7: Update `areProjectGroupsEqual`**

In `src/components/ProjectGroup.jsx:622`, also compare `prevProject.context !== nextProject.context` so memoized rows update when context changes.

**Step 8: Lint**

Run: `npm run lint`
Expected: passes.

**Step 9: Manual smoke test**

Run: `npm run dev:electron`
- Open the sidebar, hover a project header, click "...".
- "Edit context…" appears at the top of the menu.
- Click it; modal opens; type some text; press Save.
- Re-open the same modal; confirm the text persists.
- Send a message in a chat under that project and confirm (via `ps`/log) that the `--append-system-prompt` value contains the "PROJECT CONTEXT" header followed by the typed text.

**Step 10: Commit**

```bash
git add src/components/ProjectGroup.jsx src/components/Sidebar.jsx src/App.jsx
git commit -m "feat(projects): edit per-project context from the project menu"
```

(Adjust the staged paths to whatever you actually modified.)

---

## Task 7: Add context input to `NewProjectModal`

**Files:**
- Modify: `src/components/NewProjectModal.jsx:13-189`

**Step 1: Add state**

Inside the component, add:

```js
const [contextValue, setContextValue] = useState("");
```

Reset on `open` toggle alongside the other state resets in the `useEffect` on line 19.

**Step 2: Add the textarea**

Below the local-folder section's button (inside `bodyStyle`, before the `error` block), add a new section:

```jsx
<div style={sectionStyle}>
  <div style={sectionHeaderStyle}>
    <span>Project Context (optional)</span>
  </div>
  <textarea
    rows={5}
    value={contextValue}
    onChange={(e) => setContextValue(e.target.value)}
    placeholder="Notes Claude should know about this project..."
    style={{ ...inputStyle, resize: "vertical", minHeight: 88 }}
    spellCheck={false}
    disabled={busy}
  />
  <div style={hintStyle}>
    Appended to the system prompt for every chat in this project. Editable later from the project menu.
  </div>
</div>
```

**Step 3: Forward context on success**

Update both callbacks to include the context:

In `handleClone`:

```js
onCloned?.(result.path, contextValue.trim() || undefined);
```

In `handlePickLocal`:

```js
onPickedLocalFolder?.(folder, contextValue.trim() || undefined);
```

**Step 4: Update the App-side handlers**

In `src/App.jsx`, find:
- `registerManualProject(projectPath)` (around line 2211)
- `handleClonedRepo(clonedPath)` (around line 2228)

Change their signatures to optionally accept a `context` argument and write it into the meta:

```js
const registerManualProject = useCallback((projectPath, context) => {
  if (!projectPath) return;
  const projectRoot = getMainRepoRoot(projectPath);
  setProjects((prev) => {
    const existing = prev[projectRoot] || {};
    return {
      ...prev,
      [projectRoot]: {
        ...existing,
        name: existing.name || projectRoot.split("/").pop(),
        manual: true,
        hidden: false,
        ...(typeof context === "string" && context.trim()
          ? { context: context.trim() }
          : {}),
      },
    };
  });
}, []);

const handleClonedRepo = useCallback((clonedPath, context) => {
  if (clonedPath) registerManualProject(clonedPath, context);
}, [registerManualProject]);
```

Find the `onPickedLocalFolder` prop passed to `<NewProjectModal>` and pipe the same second argument through to `registerManualProject`.

**Step 5: Lint**

Run: `npm run lint`
Expected: passes.

**Step 6: Manual smoke test**

Run: `npm run dev:electron`
- Click "New Project".
- Pick a local folder with the textarea filled in.
- After the modal closes, open the new project's "..." menu → "Edit context…" and confirm the typed value is preloaded.

**Step 7: Commit**

```bash
git add src/components/NewProjectModal.jsx src/App.jsx
git commit -m "feat(projects): capture initial context when creating a project"
```

---

## Task 8: End-to-end verification

**Step 1: Lint clean**

Run: `npm run lint`
Expected: zero errors.

**Step 2: Restart dev app**

Run: `npm run dev:electron`

**Step 3: Verify the full flow**

- Existing project: open "..." → Edit context → save text → start a new chat in that project → send a message → confirm Claude responds in a way consistent with the context (or inspect the spawned process args via `ps -ef | grep -- --append-system-prompt`).
- New project: create one with context filled in → confirm Claude sees it on first message.
- Empty / unset context: chats in projects without context have no `PROJECT CONTEXT` block in `--append-system-prompt` (verify via `ps`).
- Edit existing context to empty: subsequent spawns should not include the `PROJECT CONTEXT` block.

**Step 4: Final commit**

If any small fixes were needed during verification:

```bash
git add -p
git commit -m "fix(projects): <whatever needed fixing>"
```

Otherwise, the feature is done.

---

## Out of scope (do NOT do)

- Writing context to `CLAUDE.md` files in the project directory.
- Per-conversation context overrides.
- Markdown preview in the modal.
- Keyboard shortcut to open the modal from anywhere.
