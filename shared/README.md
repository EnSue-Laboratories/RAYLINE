# shared/

Code shared by the renderer (`src/`, tsconfig.renderer.json) and the main
process (`electron/`, tsconfig.electron.json). Import it with the `@shared/*`
alias, e.g. `import type { InvokeResult } from "@shared/ipc/contract"`.
Architecture overview: [docs/architecture.md](../docs/architecture.md).

## The rule: runtime-agnostic

Everything here is compiled by **both** projects, so it may use neither DOM
APIs (`window`, `document`, `File`, `localStorage`, …) nor Node/Electron APIs
(`fs`, `path`, `process`, `Buffer`, `electron`, …). Only pure types and pure
functions. No `any`, no `as any`, no `@ts-ignore` — use `unknown` plus a type
guard at boundaries (see `isPersistedAppState`, `isAgentStreamPayload`).

## Layout

| Path | Contents |
| --- | --- |
| `ipc/contract.ts` | Every IPC channel: `InvokeChannels`, `SendChannels`, `SyncChannels`, `EventChannels`, the `InvokeArgs` / `InvokeResult` / `SendArgs` / `SyncArgs` / `SyncResult` / `EventPayload` / `Unsubscribe` helpers, and the renderer-side signatures `Invoker<K>` / `Sender<K>` / `EventSubscriber<K>` |
| `ipc/renderer-api.ts` | `RaylineApi` (`window.api`, electron/preload — main and terminal windows) and `GithubApi` (`window.ghApi`, electron/preload-pm — GitHub Projects window). The `Window` augmentation is in `src/types/window.d.ts` |
| `ipc/index.ts` | Type re-exports of both files above |
| `agent/` | `events.ts`: the `agent-stream` / `agent-done` / `agent-error` payloads (`AgentDonePayload` always carries `provider` and `exitCode`), the `AgentStreamEvent` union and its guards. Raw provider event shapes: `claude-stream.ts`, `codex-stream.ts`, `opencode-stream.ts` (also used for Grok / AGY), `multica-stream.ts`. `usage.ts`: token usage and rate limits |
| `chat/types.ts` | Messages and parts (including `ErrorPart`), conversations (`effort`, `grokContinue`), the session ledger, attachments, agent start/edit/cancel requests, permission prompts, dispatch |
| `models/` | Model registry — see [Model ids](#model-ids) |
| `state/types.ts` | Persisted settings (`PersistedAppState`) and the v2 split storage types: `PersistedAppIndex`, `PersistedConversationFile`, `StateSaveRequest`, `ARCHIVED_TOOL_PAYLOAD_LIMIT` |
| `providers/types.ts` | Provider ids (`RuntimeProviderId`: claude, codex, opencode, multica, grok, agy), CLI install snapshot, upstream and SSH remote-runtime config |
| `git/`, `github/`, `terminal/`, `system/`, `updater/` | Domain types for the corresponding IPC channels |

`models/` files:

| File | Contents |
| --- | --- |
| `catalog.ts` | Static catalogue (Claude, Codex, Grok, AGY) and `DEFAULT_MODEL_ID` |
| `registry.ts` | Id and effort resolution (`normalizeModelSelection`, `resolveEffort`), `getAvailableModels` |
| `legacy-ids.ts` | Every previously persisted id, including PR #230's formats (`getLegacyModelAlias`) |
| `runtime-catalog.ts` | Runtime discovery: CLI output parsers, `normalizeRuntimeModelCatalog`, `buildRuntimeModels`, `mergeModelCatalog` |
| `options.ts` | Picker helpers (`visibleModels`, `modelLabel`, `filterModels`) and planner capability (`PLANNER_PROVIDERS`, `isPlannerModel`) |
| `dynamic-models.ts` | Builders for OpenCode / Multica / provider-upstream / SSH models |
| `ids.ts` | Id builders and parsers |
| `types.ts` | `ModelDefinition` union, `EffortLevel`, `RuntimeModelCatalog` |

## Adding an IPC channel

1. **Contract** — add the channel to the right map in `ipc/contract.ts`
   (named-tuple `args` in the order the preload passes them, and the exact
   `result` the handler resolves to). Put new domain types in the matching
   `shared/<domain>/types.ts`.
2. **Renderer API** — add the method to `RaylineApi` / `GithubApi` in
   `ipc/renderer-api.ts`. Prefer `Invoker<"channel">` / `Sender<"channel">` /
   `EventSubscriber<"channel">`; spell the signature out only when the
   preload wraps the channel.
3. **Preload** — expose it in `electron/preload.ts` (or `preload-pm.ts`) with
   the `invoker` / `sender` / `syncSender` / `subscriber` helpers from
   `electron/preload/ipc.ts`. The exposed object is checked with
   `satisfies RaylineApi` / `satisfies GithubApi`, so a missing or mistyped
   method fails to compile.
4. **Handler** — register it in the domain module under `electron/ipc/`
   with the typed helpers from `electron/ipc/typed.ts` (`handle`, `on`,
   `onSync`; and `sendTo`, `sendToWindow`, `broadcast` for events), which
   check names, argument tuples and results against the contract. A new
   domain module must be added to `registerIpc` in `electron/ipc/index.ts`.
   Return literal results with `as const` (`{ success: true as const }`) —
   TypeScript widens them in generic handler callbacks. Arguments come from
   the renderer, so keep a guard where the shape matters.

The renderer then calls `window.api.<method>` (or `window.ghApi.<method>`)
and gets the typed result.

## Model ids

Model ids no longer encode reasoning effort; effort is a per-conversation
setting (`conversation.effort`) validated by `resolveEffort()`. Grok's
project continuation is `conversation.grokContinue`. Old persisted ids
(`gpt55-high`, `gpt54-med`, and PR #230's `gpt61-sol-high`,
`codex-model:<slug>:<effort>`, `grok-47`, `grok-46-continue`, `sonnet-1m`, …)
keep resolving through `getLegacyModelAlias()` — use
`normalizeModelSelection()` when migrating state so the encoded effort (and
Grok `grokContinue`) is kept. Details are in the headers of
`models/registry.ts` and `models/legacy-ids.ts`.

Runtime discovery: main answers `model-catalog` with a `RuntimeModelCatalog`
(`electron/providers/model-catalog.ts`, built with `parseCodexModelsCache` /
`parseGrokModelsOutput` / `parseAgyModelsOutput`); the renderer runs
`normalizeRuntimeModelCatalog` → `buildRuntimeModels` and passes the result
(plus upstream / SSH / OpenCode / Multica extras) to `getAvailableModels`,
then `visibleModels` for pickers.
