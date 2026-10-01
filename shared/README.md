# shared/

Code shared by the renderer (`src/`, tsconfig.renderer.json) and the main
process (`electron/`, tsconfig.electron.json). Import it with the `@shared/*`
alias, e.g. `import type { InvokeResult } from "@shared/ipc/contract"`.

## The rule: runtime-agnostic

Everything here is compiled by **both** projects, so it may use neither DOM
APIs (`window`, `document`, `File`, `localStorage`, …) nor Node/Electron APIs
(`fs`, `path`, `process`, `Buffer`, `electron`, …). Only pure types and pure
functions. No `any`, no `as any`, no `@ts-ignore` — use `unknown` plus a type
guard at boundaries (see `isPersistedAppState`, `isAgentStreamPayload`).

## Layout

| Path | Contents |
| --- | --- |
| `ipc/contract.ts` | Every IPC channel: `InvokeChannels`, `SendChannels`, `SyncChannels`, `EventChannels` and the `InvokeArgs` / `InvokeResult` / `SendArgs` / `EventPayload` / `Unsubscribe` helpers |
| `ipc/renderer-api.ts` | `RaylineApi` (`window.api`, electron/preload) and `GithubApi` (`window.ghApi`, electron/preload-pm). The `Window` augmentation is in `src/types/window.d.ts` |
| `agent/` | `events.ts` — `agent-stream` / `agent-done` / `agent-error` payloads and the `AgentStreamEvent` union; raw Claude / Codex / OpenCode / Multica event shapes; token usage and rate limits |
| `chat/types.ts` | Messages and parts, conversations, the session ledger, attachments, agent start/edit/cancel requests, permission prompts, dispatch |
| `models/` | Model registry: `ModelDefinition` union, static catalogue (`catalog.ts`: Claude, Codex, Grok, AGY), legacy ids incl. PR #230 formats (`legacy-ids.ts`), effort resolution (`registry.ts`), runtime discovery (`runtime-catalog.ts`: `buildRuntimeModels`, `mergeModelCatalog`, CLI output parsers), picker helpers (`options.ts`: `visibleModels`, `modelLabel`, `filterModels`, planner capability), dynamic (OpenCode / Multica / upstream / SSH) model builders |
| `git/`, `github/`, `terminal/`, `providers/`, `state/`, `updater/`, `system/` | Domain types for the corresponding IPC channels |

## Adding an IPC channel

1. **Contract** — add the channel to the right map in `ipc/contract.ts`
   (named-tuple `args` in the order the preload passes them, and the exact
   `result` the handler resolves to). Put new domain types in the matching
   `shared/<domain>/types.ts`.
2. **Preload** — add the method to `RaylineApi` / `GithubApi` in
   `ipc/renderer-api.ts` (prefer `Invoker<"channel">` / `Sender<"channel">` /
   `EventSubscriber<"channel">`) and expose it in `electron/preload.ts` (or
   `preload-pm.ts`) with the `invoker` / `sender` / `subscriber` helpers from
   `electron/preload/ipc.ts`; the exposed object is checked with
   `satisfies RaylineApi` / `satisfies GithubApi`.
3. **Handler** — register it in the domain module under `electron/ipc/`
   with the typed helpers from `electron/ipc/typed.ts` (`handle`, `on`,
   `onSync`, `sendTo`, `broadcast`), which check names, argument tuples and
   results against the contract. Return literal results with `as const`
   (`{ success: true as const }`) — TypeScript widens them in generic
   handler callbacks.

The renderer then calls `window.api.<method>` and gets the typed result.

## Model ids

Model ids no longer encode reasoning effort; effort is a per-conversation
setting validated by `resolveEffort()`. Old persisted ids (`gpt55-high`,
`gpt54-med`, and PR #230's `gpt61-sol-high`, `codex-model:<slug>:<effort>`,
`grok-47`, `grok-46-continue`, `sonnet-1m`, …) keep resolving through
`getLegacyModelAlias()` — use `normalizeModelSelection()` when migrating state
so the encoded effort (and Grok `grokContinue`) is kept. Details are in the
headers of `models/registry.ts` and `models/legacy-ids.ts`.

Runtime discovery: main answers `model-catalog` with a `RuntimeModelCatalog`
(built with `parseCodexModelsCache` / `parseGrokModelsOutput` /
`parseAgyModelsOutput`); the renderer runs `normalizeRuntimeModelCatalog` →
`buildRuntimeModels` and passes the result (plus upstream / SSH / OpenCode /
Multica extras) to `getAvailableModels`, then `visibleModels` for pickers.
