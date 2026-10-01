# Renderer performance audit (refactor/typescript)

Method: static reading of the code at `8cd0039`, a `vite build`, and measurements taken against the real persisted state on the dev machine (`~/Library/Application Support/RayLine/claudi-state.json` is **80.7 MB**, with 229 conversations and 2,068 archived messages). Line numbers refer to the renamed `.ts`/`.tsx` files.

## Already done (don't redo)

- **#226/#227**
  - Stream events are coalesced into about 30 fps commits using rAF and `startTransition` (`useAgent.ts:1213-1270`). Terminal events flush immediately.
  - `ChatComposer` is memoized and owns the keystroke state, so typing no longer re-renders the transcript.
  - Scroll pinning is batched through a single rAF (`ChatArea.tsx:902`).
  - Completed markdown parts are memoized in `MarkdownTextPart`, and plugin arrays are stable.
  - Prism highlighting is skipped while a segment streams.
  - Sidebar row identity is reused, previews are throttled to 500 ms, and `ProjectGroup` has a deep comparator.
  - Per-conversation persist snapshots are cached (`App.tsx:1396`).
- **#208**
  - Message images are stored on disk, not as base64 in state.
  - Messages use `content-visibility:auto` (`Message.tsx:252`).
  - Grain and Aurora frame budgets respect window visibility.
- **#223**
  - AuroraCanvas and Grain were removed from App. **Both files are now dead code. Delete them (owner: settings).**
  - The sidebar `blur(56px)` was removed, `transition: all` was replaced, and the sidebar search state was reworked.
  - Per-project conversation lists are virtualized (`ProjectGroup.tsx:295`).

## Top 10 hotspots (ranked by user-visible impact)

### 1. The whole app state, 77 MB, is persisted over IPC and written synchronously in main
- **Evidence**
  - `persistStatePayload` (`App.tsx:1568`) contains every conversation's `archivedMessages`. These come from `buildPersistedConversationSnapshot` (`App.tsx:1088`).
  - The payload is debounced only 300 ms (`App.tsx:1935`). It changes whenever any of these happen: a conversation switch (`persistedActive`), any settings slider, a tab pin, or every stream commit. So it fires at every pause longer than 300 ms inside an agent run (tool calls).
  - Main runs `normalizeStateImagesForPersist`, then `JSON.stringify(merged, null, 2)` and `fs.writeFileSync` (`main.ts:1008-1016`).
  - `beforeunload` calls `sendSync` with the same payload (`App.tsx:1943`, `main.ts:1034`).
- **Measured on the real file**
  - Indented stringify: 192 ms. `writeFileSync`: 155 ms. `structuredClone`: 65 ms (this is the renderer-side IPC cost). Startup read+parse: 217 ms.
  - **91% of the bytes (69.7 MB) are `tool.result` strings.**
  - The main process is blocked for more than 400 ms per save. During that time `agent-stream` IPC stalls, which shows up as stream stutter right after clicking a conversation or moving a slider.
- **Fix**
  1. Cap `tool.result` and `tool.args` in archives at 16 KB with a `…[truncated N bytes]` marker, applied in the serializer. The full output is still in the CLI session files. This is a behavior change, so list it in the PR.
  2. Split storage into `state.json` (settings plus convo metadata, no messages) and `conversations/<id>.json`. Write only dirty conversations. Detect dirtiness by snapshot identity, which the cache at `App.tsx:1396` already provides.
  3. In main, use `fs.promises.writeFile` on a temp file plus `rename`, no indentation, one write in flight with a trailing write.
  4. `beforeunload` sends only the pending dirty set.
  5. Load `archivedMessages` lazily, when a conversation is selected.
- **Owners**
  - app-shell: payload, dirty tracking, lazy load.
  - electron-shell: handlers and async atomic write.
  - Contract: `shared/ipc` channels `state:save-settings`, `state:save-conversations {upserts, deletes, order}`, `state:load-conversation`.

### 2. Callback churn defeats every memo while streaming
- **Evidence.** `getConversation` gets a new identity on every flush (`useAgent.ts:1513`). That cascades:
  - `handleSend` depends on `activeData` and `getConversation` (`App.tsx:3339`), which re-renders the memoized `ChatComposer` on every flush.
  - `handleEdit` (`App.tsx:3776`) feeds `onEdit` into every `memo(Message)` (`ChatArea.tsx:106-118`), so **every message re-renders on every flush**.
  - `handleSelect` (`App.tsx:2302`) is passed as `onSelect` to `ProjectGroup`, whose `areProjectGroupsEqual` fails, so every project group re-renders.
  - `ToolCallBlock` and `ThinkingBlock` are not memoized (`ToolCallBlock.tsx:119`).
- **Measured on real data.** One conversation has 64 messages and 834 tool parts. At 30 flushes/s that is about 25k component renders/s for one streaming message.
- **Fix**
  - Callbacks read live state from the store or a ref (`store.getState()`), not from closures. Wrap every handler passed down in `useStableCallback`, promoted from `Message.tsx:69` to `src/hooks/useStableCallback.ts`.
  - Also stabilize these, which are currently inline or fresh each render: `handleModelChange` (`App.tsx:3779`), `onCwdChange`, `onCancelNewChat`, `onClose`, `onAppearanceChange` (`App.tsx:4300-4400`), `handleToggleTerminal`, and `handleRefocusTerminal`.
  - Wrap `ToolCallBlock`, `ThinkingBlock`, `AskUserQuestionBlock`, `MermaidBlock`, `InteractiveBlock`, and `ValueControlBlock` in `memo`.
- **Owners:** app-shell for the handlers, chat-blocks for the `memo` wrappers.

### 3. Conversation state lives at the root
- **Evidence.**
  - `useAgent()` is called inside `App` (`App.tsx:1251`). Each flush re-runs all of App's roughly 4.4k lines: about 150 hooks, `persistableConversations` (229-row loop), `convosForSidebar` (229), `pinnedTabs` (`App.tsx:2537`), the tab-pin effect (`App.tsx:1969`), and the capture effect (`App.tsx:2601`).
  - Settings changes, terminal polls, and git polls also re-render the whole tree.
- **Fix:** move to the store described under Architecture below. App subscribes to almost nothing.
- **Owners:** chat-core (store and actions), app-shell (consumers).

### 4. Synchronous session I/O in the main process
- **Evidence**
  - `listSessions` reads **whole** JSONL files to get the first 50 lines (`session-reader.ts:487-498`).
  - `findCodexSessionFile` recursively walks every Codex session file on each lookup (`session-reader.ts:106,123`). That is 1,777 files on this machine.
  - `findSessionFile` makes 128 `existsSync` calls.
  - `loadSessionSearchText` fully parses each session (`session-reader.ts:608`). Sidebar search calls it for **every** conversation (`Sidebar.tsx:299`).
  - At startup, a `loadSession` loop runs for every conversation that has no preview (`App.tsx:2311`).
  - `~/.claude/projects` holds 1.8 GB across 496 files, 84 of them over 5 MB.
  - Result: the first search, or a cold start, freezes main for seconds, and every IPC call and stream stalls with it.
- **Fix**
  - Use `fs.promises` throughout.
  - Keep a sessionId→path index, built once in the background and refreshed on a miss.
  - Use `readline` for the first N lines.
  - Cache search text keyed by `mtime`.
  - Throttle the startup preview loop to 4 concurrent loads, and only for visible rows.
- **Owners:** electron-services (session-reader), app-shell (preview loop), sidebar-nav (search batching).

### 5. Streaming markdown re-parses the whole message (O(n²))
- **Evidence.** The streaming last part re-runs remark-gfm, remark-math, **rehype-raw (parse5)**, rehype-sanitize and rehype-katex over its entire text on each flush (`Message.tsx:997-1015`, `630`).
- **Fix**
  - Split the streaming text into top-level blocks: blank lines outside code fences and `$$`. Render each block through a memoized `MarkdownBlock` keyed by index, so only the tail block is re-parsed.
  - Include `rehypeRaw`/`rehypeSanitize` only when `/<[a-z/]/i.test(text)`, and `remarkMath`/`rehypeKatex` only when the text contains `$`. Keep the plugin arrays as module constants, one per combination.
  - Throttle tail re-parsing to 10 Hz once the tail is over 8 KB.
  - At the end of a stream, the components object switches from `scaledMdStreaming` to `scaledMdStatic` (`Message.tsx:680-681,1011`). That remounts every `pre` and `code` element, so `MermaidBlock` renders again. Use one stable components object and pass `isStreaming` through a small context instead.
- **Owner:** chat-core.

### 6. No windowing for long conversations
- **Evidence.**
  - `ChatTranscript` maps all messages (`ChatArea.tsx:106`). Opening a conversation mounts every message, parses all markdown, and runs Prism over every code block in one synchronous commit.
  - `content-visibility` saves paint and layout, not React or parse work.
  - A single assistant message can hold more than 100 tool parts.
- **Fix**
  - Render a tail window of the last 40 messages, with an `IntersectionObserver` sentinel at the top that prepends 40 more. Preserve the scroll anchor through `scrollHeight` delta inside the existing `schedulePinToBottom` rAF.
  - Collapse runs of three or more consecutive tool parts into a "N tool calls" group that mounts its children only when expanded.
  - Highlight code after the commit using `requestIdleCallback`: plain text first, then Prism.
- **Owners:** chat-core (window), chat-blocks (tool group).

### 7. Bundle: 2.56 MB of JS parsed at startup
See the Bundle section. Prism ships all 274 grammars (about 562 KB of the 1.3 MB main chunk). Mermaid and d3 (about 564 KB) and KaTeX (257 KB plus fonts) are preloaded eagerly.
- **Owners:** lead (config), chat-core (Prism, KaTeX), chat-blocks (Mermaid, html-to-image), app-shell (lazy modals).

### 8. Idle polling re-renders the whole app
- **Evidence.**
  - `useTerminal` polls `terminalList` every 3 s (`useTerminal.ts:146`). `setSessions(nextSessions)` always gets a new array (`:20`), so **App re-renders every 3 s forever, even with zero terminals**.
  - The returned `terminal` object is fresh on every render, so `createSidebarTerminalSession` (`App.tsx:4066`) and `setActiveSession` (`useTerminal.ts:264`) churn too.
  - `useGitStatus` is mounted twice for the same `cwd` (`ChatArea.tsx:1040`, `GitStatusPill.tsx:47`). That means two `git status` runs every 10 s and two `git fetch` runs every 60 s, and `setStatus` gets a new object every time.
- **Fix**
  - Drop the poll, since `onTerminalSessionsState` already pushes updates.
  - Compare snapshots by `name`/`exitCode` before calling `setState`, and memoize the returned API.
  - Make `useGitStatus` a per-`cwd` shared subscription (a module-level map of refcounted pollers) and skip `setStatus` when the result is deep-equal.
- **Owners:** terminal-pm-ui (useTerminal), app-shell (useGitStatus).

### 9. Each streamed event copies everything
- **Evidence.** `applyStreamEventToConversations` runs `new Map(prev)`, `[...convo.messages]`, `cloneParts` (which clones **every** part) and `cloneStreamState` for every event (`useAgent.ts:497-499`, `686-688`, `10-21`). A 32 ms flush with N events costs O(N·(messages + parts)) and gives every part a new identity, which defeats `memo` on blocks.
- **Fix**
  - Create one draft per flush: copy the Map, the target conversation, its message array, and the last message once.
  - Mutate the draft for all events, copying only the touched part (copy-on-write).
  - Commit once.
- **Owner:** chat-core.

### 10. Sidebar recomputes on every flush, and search never settles
- **Evidence.**
  - `convosForSidebar` always returns a new array (`App.tsx:3920`), so `groupConvosByProject` re-runs on every flush (`Sidebar.tsx:388`).
  - While search is active, `searchInputKey` and the search effect restart on every flush (`Sidebar.tsx:277,324-378`). **Search results never arrive while any chat is streaming.**
  - `pinnedTabs` and `tabs` are new on every flush, which re-renders `MemoTabStrip`.
- **Fix**
  - Return the previous array when every row is reused.
  - Build the search key from `id` plus `updatedAt` only, not from streaming previews.
  - Memoize `pinnedTabs` by a signature.
- **Owners:** app-shell (row arrays), sidebar-nav (search key).

### Lower priority
- **settings:** `backdrop-filter: blur(20px)` on the composer (`ChatArea.tsx:749`) and on the hidden scroll-to-bottom button (`:1319`) re-blurs on every scroll frame. Use a solid surface when there is no wallpaper, and `display:none` when the button is hidden.
- **app-shell:** the wallpaper is a multi-MB `data:` URL held in state and inline style (`App.tsx:4180`). Use a `file://` or custom-protocol URL instead.
- **electron-providers:** `claude-usage-fetcher.ts:69` makes a synchronous `execFileSync('security')` keychain call on main. Make it async.
- **electron-shell:** terminal output is sent to **all** windows for each PTY chunk (`main.ts:618`). Batch it every 16 ms and send it only to subscribed windows.
- **chat-blocks:** `LoadingStatus` ticks every 250 ms; 1 s is enough.
- **data-i18n:** `FontSizeContext` holds a primitive, which is fine. Later, replace `s(px)` with CSS `calc(var(--fs-scale)*Npx)`.

## Cross-package architecture: one tiny external store (no new dependency)

Use a store built on `useSyncExternalStore` instead of zustand. It is about 40 lines, matches React 19's concurrent semantics, and its API mirrors zustand's vanilla store, so it could be swapped later. **lead lands it before fan-out.**

```ts
// src/store/createStore.ts (lead)
export interface Store<S> {
  getState(): S;
  setState(next: S | ((prev: S) => S)): void; // no-op if Object.is(prev,next)
  subscribe(listener: () => void): () => void;
}
export function createStore<S>(initial: S): Store<S>;
export function useStore<S, T>(store: Store<S>, selector: (s: S) => T,
  isEqual?: (a: T, b: T) => boolean /* default Object.is */): T;
export function shallowEqual(a: unknown, b: unknown): boolean;
// src/hooks/useStableCallback.ts (lead): ref-backed, identity never changes.
```

### Stores

- **`src/store/conversations.ts`** (chat-core)
  - State: `{ byId: ReadonlyMap<string, ConversationRuntime> }`.
  - Actions are plain functions (`prepareMessage`, `appendLocalMessages`, `cancel`, `editAndResend`, `loadMessages`, `replaceMessages`), moved out of `useAgent`.
  - The stream buffer flushes into the store once per frame, keeping the current 32 ms cadence and the immediate flush for terminal events.
  - Selectors:
    - `useMessageIds(cid)`: stable unless messages are added.
    - `useMessage(cid, mid)`: only the streaming message re-renders.
    - `useConversationStatus(cid)`: `{ isStreaming, error }`, shallow-compared.
    - `useStreamingIds()`.
  - `getConversation(id)` is a non-reactive read for handlers.
- **`src/store/appSettings.ts`** (app-shell): every persisted setting currently held in App `useState` (`App.tsx:1265-1303`). `Settings` reads and writes it directly, which removes about 40 props.
- **`src/store/convoList.ts`** (app-shell): conversation metadata rows. Sidebar selects rows; `ChatArea` selects the active row.
- **`src/store/persistence.ts`** (app-shell): subscribes to all three stores, tracks dirty ids by identity, debounces 1 s, and sends the delta IPC from hotspot #1.

### Rules
- Components subscribe with narrow selectors.
- Handlers read `store.getState()` and are wrapped in `useStableCallback`.
- Never pass `getConversation` or `activeData` through props.
- Keep contexts only for theme, locale, and font scale. These change rarely and hold primitive or memoized values.

## Bundle report (`vite build`)

Measured: 165 chunks. Initial `index.html` preloads **2,562 KB** of raw JS.

| Chunk | Size (raw / gzip) | Loaded | Contents |
|---|---|---|---|
| `main` | 1,301 / 406 KB | eager | App + Prism with all 274 grammars (~562 KB) + react-markdown + rehype |
| mermaid core + d3 / dompurify / rough (~20 chunks) | ~564 KB | **eager** (modulepreload) | static `import mermaid` (`MermaidBlock.tsx:3`) |
| `katex` | 257 / 77 KB + fonts | **eager** | `rehype-katex` (`Message.tsx:8`) |
| `appearance` | 207 / 66 KB | eager | react-dom vendor, shared with PM and terminal |
| `lib` | 205 / 61 KB | eager | i18n + markdown, shared with PM |
| `xterm` | 332 KB | lazy (good) | `TerminalDrawer.tsx:417` |
| cytoscape, mermaid diagrams | 434 KB, 474 KB, … | lazy | |

Warnings:
- `INEFFECTIVE_DYNAMIC_IMPORT` for `src/multica/store`. App imports it dynamically (`App.tsx:2731,3403,3518`), but Settings, MulticaSetupModal and `data/multicaModels` import it statically. Make it a plain static import (app-shell).
- Chunk over 500 KB.

### Proposed splits

1. **Prism** (chat-core): switch to `PrismLight` and register about 25 languages (ts/tsx/js/jsx/json/bash/python/go/rust/css/html/markdown/yaml/diff/sql/java/c/cpp/swift/kotlin/ruby/php/toml/docker). Load other grammars on demand with `import()`. This saves about 500 KB.
2. **Mermaid** (chat-blocks): `const { default: mermaid } = await import("mermaid")` inside the render effect. This takes about 564 KB off startup.
3. **KaTeX** (chat-core): load `remark-math`, `rehype-katex` and the CSS only when a message contains `$` (memoize the import promise).
4. **`React.lazy` + `Suspense`**, done by whoever owns the import site. The lazy component must export `default` (component owners: keep it that way).
   - App (`App.tsx:6,13-15`, owner app-shell): `Settings` (3.4k lines), `DispatchCard`, `MulticaSetupModal`, `NewProjectModal`. Also mount the modals only when they are open (`MulticaSetupModal` and `NewProjectModal` are currently always mounted).
   - ChatArea (`ChatArea.tsx:8-9`, owner chat-core): `NewChatCard`, `RuntimeSetupCard`.
   - ProjectGroup (`ProjectGroup.tsx:9`, owner sidebar-nav): `ProjectContextModal`.
5. **`html-to-image`** (chat-blocks): `import()` inside the click handler in `CopyImageBtn` and the export code.
6. **lead:** add `build.rolldownOptions.output.codeSplitting.groups` for `react`/`react-dom` (vendor), `react-markdown`/`remark`/`rehype` (markdown), and `@xterm` (terminal), and set `chunkSizeWarningLimit: 600`.

**Target:** initial JS at or below 1.1 MB.
