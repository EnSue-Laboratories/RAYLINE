# TypeScript refactor: summary

This is a record for reviewers of the `refactor/typescript` integration branch. The architecture as it stands now is described in [`docs/architecture.md`](../architecture.md). The rules every package followed are in [`CONVENTIONS.md`](CONVENTIONS.md), and the performance audit that set the targets is [`PERF.md`](PERF.md).

## Goals

1. **Strict TypeScript everywhere.** No `any`, no `@ts-ignore`, no `@ts-nocheck`. Untrusted data is typed as `unknown` and narrowed with guards at the boundaries.
2. **One typed IPC contract** between the renderer windows and the main process.
3. **Decoupling.** Split the monoliths into pure logic, side-effecting services and thin components:
   - `App.jsx`: 4,433 lines
   - `main.cjs`: 3,075 lines
   - `Settings.jsx`: 3,443 lines
4. **Fix the measured performance hotspots** listed in PERF.md: persistence, session I/O, streaming re-renders, bundle size and idle polling.
5. **Bring the CLI and model handling up to date** (Claude Code 2.1.287, codex-cli 0.153.4), and port PR #230 (Grok, Antigravity, unified model picker, draft recovery).

## Approach

- **Integration branch.** `refactor/typescript` was branched from `main` at `8cd0039`. The foundation commits went in first:
  - `25589b0`, the TypeScript foundation:
    - split strict tsconfigs with the `@shared` alias;
    - typed ESLint rules;
    - esbuild for the main process;
    - every file renamed to `.ts`/`.tsx` with a temporary `@ts-nocheck` header;
    - the `shared/` IPC contract and model registry;
    - `createStore`, Vitest and CI.
  - `92065c4`, the v2 persistence contract.
  - `807f558`, the `AgentEventSink` seam.
  - The shared pieces of #230: `25dd3ba`, `2352d66` and `8f158ee`.
- **10 parallel package PRs.** Each owned a fixed set of files (see the CONVENTIONS ownership rules) and was developed in its own worktree. Wherever a dependency wasn't converted yet, the PR went through a temporary `TODO(ts-boundary)` cast. Every PR passed typecheck, typed lint, tests and the build, and listed its behavior changes.
- **Cleanup.**
  - #240 removed the boundary casts and the `globalThis` handoff once everything had landed.
  - #241 replaced the native `<select>`s with an app-styled `MenuSelect`.
  - `3db975d` added the picker i18n keys.

Final state: `npm run ts:progress` reports **663/663 files converted, 0 still `@ts-nocheck`**. #242 reported 676 tests passing.

| PR | Package | Main changes |
|---|---|---|
| [#231](https://github.com/EnSue-Laboratories/RAYLINE/pull/231) | data-i18n | Typed locales (`zh-CN satisfies Record<MessageKey,string>`), `LocaleProvider`, cached translator, appearance split, shared `createStore` stores for OpenCode, Multica and upstreams |
| [#232](https://github.com/EnSue-Laboratories/RAYLINE/pull/232) | electron-services | Async session index; terminal / MCP / checkpoint / gh split into `electron/services/`; #219 fix; TypeScript scripts |
| [#233](https://github.com/EnSue-Laboratories/RAYLINE/pull/233) | settings | `Settings.tsx` 3,443 → 220 lines (memoized sections); ModelPicker rebuilt on `@shared/models` with an effort selector |
| [#234](https://github.com/EnSue-Laboratories/RAYLINE/pull/234) | chat-blocks | Memoized blocks, lazy Mermaid and html-to-image, Dispatch and NewChat split |
| [#235](https://github.com/EnSue-Laboratories/RAYLINE/pull/235) | sidebar-nav | Sidebar, ProjectGroup, BranchSelector and GitStatusPill split; search settles while streaming; bounded, abortable search |
| [#236](https://github.com/EnSue-Laboratories/RAYLINE/pull/236) | terminal-pm-ui | TerminalDrawer and Project Manager split; push-only `useTerminal`; hidden-output buffering |
| [#237](https://github.com/EnSue-Laboratories/RAYLINE/pull/237) | electron-providers | `electron/providers/<id>/{args,parser,session}`, `AgentEventSink`, current Claude and Codex CLIs, Grok and AGY, model discovery |
| [#238](https://github.com/EnSue-Laboratories/RAYLINE/pull/238) | app-shell | App 4,433 → 27 lines (composition root); external stores; v2 delta persistence (renderer side) |
| [#239](https://github.com/EnSue-Laboratories/RAYLINE/pull/239) | electron-shell | `main.ts` 3,075 → ~50 lines plus `electron/app`, `ipc` and `services`; typed preloads; v2 state store (main side) |
| [#242](https://github.com/EnSue-Laboratories/RAYLINE/pull/242) | chat-core | Conversations store with a copy-on-write stream reducer, windowed transcript, block-split markdown, lazy Prism and KaTeX |
| [#240](https://github.com/EnSue-Laboratories/RAYLINE/pull/240) | cleanup | Boundary casts and `globalThis` removed; shared `WebkitAppRegion` typing |
| [#241](https://github.com/EnSue-Laboratories/RAYLINE/pull/241) | UI | `MenuSelect` replaces native selects; effort menu stacks above modals; picker typography restored |

## What changed, by area

- **IPC.**
  - Every channel is declared in `shared/ipc/contract.ts`. Main registers handlers through `electron/ipc/typed.ts`, and the preloads are checked with `satisfies RaylineApi` / `satisfies GithubApi`.
  - Additive contract changes:
    - `gh-current-branch` gained an optional `repo` argument;
    - `terminal-output-subscribe`;
    - the v2 `state:*` channels;
    - `model-catalog` and `get-app-build`.
- **Main process.**
  - `main.ts` is now a bootstrap. A typed `AppContext` replaces the module globals.
  - Agent backends sit behind an exhaustive `Record<RuntimeProviderId, AgentRuntime>`.
  - Sync fs, `execSync` and per-lookup login-shell `spawnSync` calls are gone from IPC paths (#239).
  - CLI lookup is async, and the login-shell `PATH` is warmed once in the background.
- **Providers.**
  - Pure argv builders and stream parsers, plus lifecycle modules per provider.
  - Providers emit only typed events into an `AgentEventSink`, and `agent-done` always has `provider` and `exitCode` (#237).
  - `LineSplitter` is O(n) and UTF-8-safe across chunk boundaries; before, multi-byte characters split across chunks became U+FFFD.
- **Persistence.**
  - v2 split storage (`index.json` + `conversations/<id>.json`), migrated once from `claudi-state.json`, which is left untouched.
  - Atomic, coalesced async writes, with a revision guard so a close-time sync save always wins.
  - Delta saves from the renderer and lazy transcript loading (#238, #239).
- **Renderer state.**
  - App owns no state. Settings, conversation rows, UI flags and derived views live in `createStore` stores.
  - Live chat state moved out of `useAgent` into `src/store/conversations` with narrow selectors (#238, #242).
- **Rendering.**
  - Windowed transcript and tool-call grouping.
  - Incremental block markdown and idle-time highlighting.
  - Lazy Prism, KaTeX, rehype-raw, Mermaid and html-to-image; memoized blocks (#234, #242).
- **Build.**
  - esbuild bundles the main process, preloads and two standalone helpers into `dist-electron/`.
  - `mcp-terminal-server` and the `rayline-terminal` CLI are self-contained and asar-unpacked. Before this, `claudi-terminal` was not packaged at all (`25589b0`).
  - Packaged builds run the MCP server with `ELECTRON_RUN_AS_NODE`, so no system `node` is needed (#239).
- **Terminal.**
  - Output is coalesced per session every 16 ms and sent only to subscribed windows.
  - Fixed #219, where `create_session` returned ok but the session never appeared (#232).
  - The MCP server waits for and reconnects its WebSocket (#232).

## Performance results

All numbers below are copied from the PR descriptions. They were measured on the dev machine's real data or on an isolated copy of it: 80.7 MB of state, 229 conversations.

**Main process (sessions and state)**

| Measure | Before | After | Source |
|---|---|---|---|
| `listSessions` | 12.4 s | 0.55 s | #232 |
| Session load ×60 | 1.6 s | 0.75 s | #232 |
| Warm session search ×60 | 1.4 s | 0.4 s | #232 |
| Main-thread block during session I/O | Whole duration (synchronous) | 9 ms max event-loop stall | #232 |
| State save | 275–350 ms, fully blocking (`save-state`) | 4–10 ms async (`state:save`, index) | #239 |
| State save, legacy channel in compat mode | 275–350 ms blocking | 120–230 ms async, ~115 ms longest stall | #239 |
| `state:load` (warm) / `state:load-conversation` | — | 4 ms / 5 ms | #239 |
| On-disk state | 80.7 MB single file | 446 KB `index.json` + 36.8 MB in 229 transcripts | #239 |
| One-time v2 migration | — | 0.84 s standalone, 0.28 s in-app | #239 |
| Project Manager `load-state` | Re-read the whole file on every focus | 0 ms (served from memory) | #239 |
| IPC events for a trivial Claude turn | 33 | 10 | #237 |

**Renderer**

| Measure | Before | After | Source |
|---|---|---|---|
| Initial JS (entry + modulepreloads) | 2,578,027 B, 26 preloaded files | 1,976,939 B (−23%), 7 files | #234 |
| Initial JS, after #238's lazy modals and #242 | 1,906,415 B | **832,031 B** (−56%) | #242 |
| `main` chunk | 961,899 B | 316,680 B | #242 |
| `markdown` vendor chunk | 597,990 B (with KaTeX) | 155,869 B | #242 |
| Open 88-message conversation | 3,034 renders, 6,710 DOM nodes, 434 ms | 1,265 renders, 1,981 nodes, **216 ms** | #242 |
| Open 64-message / 834-tool conversation | 6,234 renders, 12,995 DOM nodes, 624 ms | 3,400 renders, 3,154 nodes, 428 ms | #242 |
| Real Claude (haiku) stream, ~2 KB answer | 121 flushes → 212 commits, 5,316 renders (43.9 per flush) | 114 flushes → 149 commits, 3,441 renders (30.2 per flush) | #242 |
| Startup session-preview hydration | All 229 `loadSession` calls at once | At most 4 in flight | #238 |
| Idle terminal polling | `terminalList` every 3 s, re-rendering App | None (push-only) | #236 |

Taken together, the startup JS went from about 2.58 MB to about 0.83 MB. #238 also moved Settings, DispatchCard, MulticaSetupModal and NewProjectModal into lazy chunks (65 + 23 + 8 + 7 KB out of `main`). Prism, raw-HTML plugins and KaTeX now load on demand (82 KB, 174 KB and 257 KB chunks) (#242).

## CLI and model currency

The sources for these changes are in [`cli-models-research.md`](cli-models-research.md), and the flags were checked against the locally installed CLIs (#237).

- **Codex.**
  - `--full-auto` is rejected by codex-cli 0.153+, which had broken the sandboxed mode (`CLAUDI_CODEX_BYPASS_SANDBOX=0`). It is replaced by `--sandbox workspace-write -c approval_policy="never" --skip-git-repo-check`, and on resume by `-c sandbox_mode="workspace-write"`.
  - Effort is passed as `-c model_reasoning_effort=…`, clamped by the registry.
  - The parser covers the current `thread.*` / `turn.*` / `item.*` schema. The renderer now shows the reasoning, file_change, mcp_tool_call, web_search, todo_list and error items (#242).
- **Claude Code.** `--effort <level>` is sent when an effort is chosen and the model supports it. It is omitted for Haiku, unknown models and provider-upstream runs. Hook, `thinking_tokens` and `rate_limit_event` noise is no longer forwarded over IPC.
- **Models.**
  - Claude: `fable`, `fable-1m`, `opus`, `opus-1m`, `sonnet`, `haiku`.
  - Codex: `gpt-6-astra`, `gpt-6.1-sol`, `gpt-6-sol`, `gpt-6-luna`, `gpt-5.6-sol|terra|luna`, `gpt-5.5`.
  - `gpt-5.4` (retired from Codex on 2026-08-31) maps to `gpt-6-astra`.
- **Effort is separate from the model id.** Old ids that encoded an effort (`gpt55-high`, `gpt54-med`, and #230's formats) are normalized on load, and the effort they encoded is kept.
- **Grok and Antigravity (`agy`)** are new runtimes. Models are discovered from `grok models`, `agy models` and Codex's `models_cache.json`.

## PR #230 port (credit: @vickioo)

[#230](https://github.com/EnSue-Laboratories/RAYLINE/pull/230), "feat: unify model selection, add Grok and AGY, and fix desktop reliability" by **vickioo**, was written against the pre-refactor JavaScript. Instead of merging it as-is, it was ported piece by piece into the typed modules, and the ported commits carry `Co-Authored-By: vicki`. The PR itself was not merged; deciding what happens to it is left to the maintainers.

| Ported piece | Where it landed |
|---|---|
| Build source and fork release repository (`raylineBuild`, `get-app-build`) | `25dd3ba`, #239 |
| Shared composer drafts and `useDismissibleLayer` | `2352d66` |
| Grok/AGY ids and the runtime catalog | `8f158ee` (shared layer) |
| i18n keys, `LocaleContext`, Grok runtime setup | #231 |
| Unified ModelPicker (grouping, fuzzy search, keyboard, layered Escape, install footer, planner purpose, Dispatch inherit), Settings consolidation | #233 |
| ToolCallBlock incremental reveal and secret redaction, ValueControl hooks fix, Dispatch on the shared picker with inherited effort, NewChatCard drafts, IME-safe keys | #234 |
| Project dialogs, menus and chrome i18n and theming; separate project-row targets | #235 |
| zsh history kept outside the signed bundle | #232 |
| Grok and AGY providers, model catalog, system proxy, Codex MCP env as TOML | #237 |
| ChatArea kept mounted under Settings; project-row "+" opens the new-chat card; grok/agy session capture | #238 |
| `RAYLINE_USER_DATA_DIR`, single-instance lock, MCP server via `ELECTRON_RUN_AS_NODE`, grok/agy routing, planner gating, state revision guard | #239 |
| Text/reasoning merging for Grok and AGY, `ErrorBlock`, per-conversation drafts, IME-safe send, `grokContinue` | #242 |

## Behavior changes users may notice

These are collected from the "Behavior changes" sections of the PRs.

**Storage**
- State moves to `state-v2/` on first launch. The old `claudi-state.json` is left untouched, so older builds still start, but they won't see newer edits (#239).
- Archived tool results and arguments longer than 16 KB are truncated on save, with a `…[truncated N bytes]` marker. State JSON is compact (#239).
- Saves are debounced 1 s (was 300 ms) with a 10 s max wait, and nothing is written when nothing changed (#238).
- A transcript loads when its conversation is opened, showing a short "Loading…" notice (#238).

**Chat**
- Only the latest 40 messages are mounted. Older ones load as you scroll up. Runs of three or more tool calls collapse into "N tool calls" (#242).
- Errors show as a collapsible error block instead of `**Error:**` text.
- An `agent-error` no longer wipes the conversation's native session ids (bug fix).
- Grok and AGY parts keep their arrival order (#242).
- The first message that contains raw HTML or math renders once without those plugins while they load (#242).
- Settings is an overlay, and the chat stays mounted underneath, so composer drafts survive (#238).
- The project-row **+** opens the new-chat form instead of creating an empty chat (#238).
- Deleting a conversation clears its draft (#238).

**Models**
- The picker never silently switches models. An unknown, unavailable or retired saved choice is kept and labelled (#233).
- Lifecycle and CLI badges moved into the row tooltip (#241).
- Native `<select>` menus are replaced with app-styled menus (#241).
- Effort is chosen per conversation.
- Remote SSH models now receive their default effort explicitly (#238).
- Codex provider-upstream models use a 272k context window instead of 1.05M (#231).

**Dispatch**
- The default planner is the default model if it can plan, otherwise the app default (#234).
- Non-planner providers and SSH models are rejected with "Dispatch planning is not supported by X." Before, anything unknown fell back to Claude (#239).
- Rows carry and inherit effort (#234).

**Sidebar**
- Streaming previews no longer restart a search, and stale results stay visible while a re-search runs (#235).
- Project headers no longer show relative time (#235).
- Codex sessions are listed even for a cwd without a `~/.claude/projects` directory (#232).

**Terminal**
- A non-shell `command` (MCP `create_session`, `rayline-terminal --command`) now runs inside the user's shell, so it survives the command (#232).
- Scrollback preload no longer duplicates output (#236).

**App**
- Packaged builds are single-instance; a second launch focuses the running app.
- `RAYLINE_USER_DATA_DIR` selects a separate profile (#239).

**Export**
- JSON export now includes tool `input` and `output`. Before, these fields were always `null` (#234).

## Known follow-ups

These items were listed as unfinished in the PRs and were still open in the tree when this summary was written. Check before picking one up, because the final cleanup branch may already have addressed some of them.

- **Grok and AGY session discovery.** The session reader only indexes `~/.claude` and `~/.codex`, so Grok and AGY history isn't listed or searchable from disk (#232, #237).
- **Wallpaper as a `data:` URL.** The renderer still holds the wallpaper this way (PERF.md lower-priority item, #238).
- **Effort through `ModelPickerWithMultica`.** It doesn't forward `effort` / `onEffortChange`, and `src/components/new-chat/boundaries.ts` still has three `TODO(ts-boundary)` casts (#242).
- **`useAgent()`** (`src/hooks/useAgent.ts`) is no longer used by the app and can be deleted (#242).
- **i18n.** `chat.toolCallsGroup` ("{count} tool calls") is missing, and the "Notice"/"Error" block titles are English-only (#242).
- **Project Manager branch lookup.** `src/pm/create/useBranchOptions.ts` should pass the repo to `getCurrentBranch(repo)` to use the new lookup (#239).
- **Dispatch planner flags.** It still builds its own read-only `codex exec --ephemeral --sandbox read-only -o` args, because `buildCodexArgs` has no read-only mode (#239).
- **Claude usage.** The CLI's `rate_limit_event` could replace the OAuth usage fetch, but its utilization scale is unverified (#237).
- **Font scaling.** Replace `useFontScale` `s(px)` with CSS `calc(var(--fs-scale) * Npx)` (#231).
- **Adapter limits from #230.**
  - AGY forks and pasted-image payloads are unsupported.
  - The planner supports only local Claude, Codex and OpenCode.
  - Per-model account entitlements are not inferred from the catalog.
- **Validation gaps.**
  - The package PRs were verified on macOS, with Electron smoke runs against isolated profiles. Windows, Linux and live SSH execution were not exercised.
  - #233 and #234 were not checked by hand in a running app; #241 later checked the picker and effort menu in the app.
