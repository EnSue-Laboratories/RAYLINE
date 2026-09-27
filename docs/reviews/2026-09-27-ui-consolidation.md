# RayLine UI and model consolidation — 2026-09-27

## Upstream and delivery

Verified against `EnSue-Laboratories/RAYLINE` main at `8cd0039b65a3da87ec83f1b607db2701c1e8f27d` (2026-06-20). This already includes Kira-Pgr's streaming/typing/sidebar performance work (#227), SSH runtimes (#224), SSH attachment support (#228), and the merged light project-context/lockfile fixes (#220/#221).

The delivery extends the existing Grok PR **#230**, based on `9b51c31161b9b970d818d983ab1014ddeb84549b`. The outstanding UI/theme PR **#222** is superseded by this adapted implementation. No upstream main merge is performed by this delivery.

## Branch disposition

| Local branch/work | Disposition |
| --- | --- |
| `codex/add-grok-provider` / #230 | Delivery PR; retains native Grok session/continue support and structured errors. |
| Four uncommitted files on that branch | Preserved and incorporated: model expansion, paragraph wrapping, tool previews/redaction, Grok delta coalescing. |
| `codex/i18n-theme-settings-polish` / #222 | Project/context/sidebar translations and Settings theme fixes adapted to current main. The SSH settings section and newer streaming changes are preserved. |
| `codex/fix-value-control-hooks` | Imported the newer valid/invalid/streaming component separation and keyboard-accessible hover controls. |
| `codex/mobile-agent-control-plane-chg1` | Applicable desktop fixes ported: visible Back action, compact controls, output ignores. The phone/control-plane roadmap remains separate. |
| `codex/light-project-context-modal` | Already merged as #220. |
| `codex/sync-lockfile-version` | Already merged as #221; existing worktree is retained. |
| `chore/hooks-tier1-rules`, `chore/hooks-tier2-review` | ValueControl work is superseded by the newer fix. Old lint suppressions are not replayed onto current main. Branch history is retained. |
| `chore/hooks-t3-issuelist-prlist` | Separate Project Manager optimistic-list refactor retained; not mixed into the composer/model delivery. |
| `codex/add-proxy-setting` | Separate upstream network-proxy feature retained; not merged into this UI PR. |
| `main` | Fast-forwarded to the verified upstream main; no unique main commits were discarded. |

## Resulting behavior

- Model picker: type-to-open and type-to-filter; case/punctuation-insensitive names; provider/effort queries; arrow/Enter selection; Escape and outside-pointer dismissal; viewport clamping; bilingual status and action labels. Duplicate IDs and unconfigured local-only aliases do not inflate the list. Saved selections are not silently replaced when discovery is unavailable.
- Catalog: current official Claude aliases (including Haiku/Fable and explicit 1M aliases), current Codex families/efforts, Grok 4.7 and documented text/code model IDs. Codex cache metadata can override context/effort details for the installed runtime. Current CLI-configured Grok aliases are discovered separately. Historical GPT-5.4 IDs and Grok project continuation remain readable.
- Context usage: runtime metadata reaches the loading footer; source-reported context takes precedence. Unknown Grok aliases do not receive an invented context size.
- Drafts: ordinary conversation/pending drafts and new-chat form drafts recover after settings/navigation/reload; attachments are retained without reserializing their payload on each keypress. A failed storage write keeps the active draft in memory. Successful new-chat creation clears the form draft.
- Navigation: project collapse, new chat and more-options have separate visible click targets. Project **+** opens the same new-chat form as the toolbar. Menu Escape never doubles as parent-card cancellation; modal Escape closes the modal. IME confirmation does not send/create/clone.
- Appearance/localization: new-project/context dialogs, project actions, picker, new-chat/branch/worktree controls and window controls follow the current locale and theme. The duplicate hover-only-controls setting is removed. Narrow new-chat toolbars wrap, long project names truncate, and modal bodies scroll.
- Grok rendering: text/reasoning deltas join into readable paragraphs without crossing tool boundaries; existing tool-preview redaction and text wrapping are retained.

## Model evidence

- [Official Codex catalog, pinned revision](https://github.com/openai/codex/blob/694d8d45bd3d440fa4f4cbf22667ac6c17a13758/codex-rs/models-manager/models.json). The catalog revision is dated 2026-09-24. Only model metadata is copied into `src/data/codexModelCatalog.json`.
- [Official Codex model guide](https://developers.openai.com/codex/models).
- [Claude Code model aliases and provider-dependent resolution](https://code.claude.com/docs/en/model-config.md).
- [Official xAI models](https://docs.x.ai/developers/models.md) and [Grok 4.7 guide](https://docs.x.ai/developers/grok-4-7.md). These confirm `grok-4.7` and its 500,000-token context. Documented 4.3/4.20 variants use 1M and Grok Build 0.1 uses 256k.

Public catalog presence does not guarantee entitlement or compatibility with every installed CLI. Live local discovery was exercised without sending a prompt: seven Codex records and six configured Grok aliases were returned. Paid model calls, remote SSH execution, and provider-account access to each listed model were not exercised.

## Verification

- `npm run build` — production renderer build.
- `npm run verify:theme-tokens` — theme token consistency.
- `npm run test:ui-regressions` — eight focused regression tests.
- `git diff --check` and syntax checks on changed Electron CommonJS files.
- ESLint on changed JS/JSX files. Full-repository lint has a pre-existing baseline in the legacy `chat.jsx` and unrelated Project Manager components; details remain in the PR validation note rather than being hidden by rule suppressions.

Browser verification used an isolated Vite/Playwright profile, with synthetic folder/branch IPC results for project navigation; no real user prompt was sent:

1. Type a multiline Chinese/English draft, open/close Settings, reload: exact text retained.
2. Type `grok47`, select with Enter; type-to-open from the trigger, filter `codex luna max`, use arrows/Enter: correct matches and selection.
3. New-chat draft survives Back/reopen and reload; synthetic composing Enter does not create a chat.
4. Escape in model, project and branch menus leaves the form open; cold-load modal Escape closes only the modal.
5. Project-row new-chat click does not collapse the project or create an empty conversation; correct project is preselected; its draft survives return/reopen.
6. Duplicate Settings row is absent; English and Chinese change immediately, including project dialogs and chrome labels.
7. Light/Chinese and dark/English project-dialog screenshots reviewed.
8. Model menu tested at 560×520; its bounds stay within the viewport. Compact form controls and menu background reviewed visually.

Local screenshots are generated under ignored `output/playwright/`. The review server is a user-visible RayLine terminal session named `rayline-ui-review`, on port 5207. Source/PR delivery does not replace or restart the currently running installed application.
