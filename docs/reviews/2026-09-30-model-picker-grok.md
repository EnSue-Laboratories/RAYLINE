# RayLine 0.1.11: shared model picker and Grok configuration compatibility

## Changes

Conversation, new-chat and dispatch model controls now share `useModelCatalog` and `ModelPicker`. Dispatch's default, per-task and automatic-planning controls support the same search, provider grouping, reasoning labels, keyboard navigation and nested Escape behavior. A per-task selection can inherit the default model, including its reasoning level. Menus use viewport positioning and a portal above the dispatch dialog.

Planning capabilities are declared in one shared manifest and checked by the backend. The current planner supports local Claude, Codex and OpenCode. Other providers remain visible with an explanation and are disabled only for planning; they remain selectable for executing tasks.

Grok static entries are historical identities, not evidence of local availability. Explicit model choices follow `grok models`; unavailable saved choices retain their original model and show an explanation. A native CLI-default option remains usable if discovery fails. Configuring a new model makes it appear on the next discovery. Streamed Grok errors are not repeated when the CLI also writes the error to stderr and exits unsuccessfully.

## Local Grok 4.7 investigation

Installed Grok 1.0.41 initially advertised six configured models and rejected `grok-4.7` before making a provider request. The existing authenticated connection's model catalog included `grok-4.7`. A private backup of the local CLI configuration was made, then an explicit 4.7 entry was added using the same existing connection and the actual `grok-4.7` upstream model ID. The default model and existing entries were preserved. Credentials, endpoints, backups and native session IDs are excluded from this repository and release assets.

A real request through RayLine's Grok adapter, in an empty temporary workspace, returned the exact `RAYLINE_GROK47_OK` marker with exit code 0 and no errors. This proves the configured 4.7 route works locally; availability for other installations still depends on their own CLI catalog.

## Verification

- 28 focused tests passed across model options, Grok catalog/failure behavior, AGY, UI regressions and persistence.
- Theme-token validation and ESLint for changed JavaScript files passed.
- The CLI fixture verifies that an unknown-model error appearing in both JSON and stderr produces exactly one visible error and one completion event.
- Packaged UI checks confirmed all three dispatch controls share the conversation catalog (72 options on this installation), five GPT-6.1 reasoning levels, inherited defaults, keyboard filtering/selection, nested Escape and planner capability restrictions. The backend rejects an unsupported planner explicitly.
- A real Grok 4.7 request submitted from the packaged UI returned `RAYLINE_GROK47_PACKAGED_OK`, provider `grok`, exit code 0 and no error events. Draft/history reload and Chinese/light plus English/dark controls passed; no renderer page errors were observed.
- Opening a macOS terminal exposed `/etc/zshrc` retaining a history path inside the app's bootstrap directory, invalidating the installed signature. The bootstrap now restores that default path to the original user ZDOTDIR before loading user preferences. Explicit user history overrides remain effective; two real zsh checks cover both paths.
- The final application starts from `/Applications` using a minimal Finder-style PATH. Its terminal returns the exact marker and closes cleanly; strict/deep signature verification still passes afterwards. Settings identifies version 0.1.11 and source `8a72e5e`.

## Published package

- Source commit: `8a72e5e` (model picker fix `9b6b4b2` plus terminal history correction).
- DMG: `RayLine-0.1.11-arm64.dmg`, 180,351,498 bytes.
- DMG SHA-256: `30fa68bb77a3c2d54fea7495c929396b70d7c7a9dd3dd996ab691ef57351d024`.
- app.asar SHA-256: `abaee3ea026318dea2c370fd9f738a982c072acc602877aca7a016f11a3d285f`.
- Apple Silicon macOS build; ad-hoc signed and not Apple-notarized.

The local transition waits for active agents to finish, quits normally to flush state, backs up the current profile and installed bundle, verifies and installs the staged app, then opens it through the existing desktop shortcut. It does not terminate active agents. Local receipts and backups are private and outside the repository.


## Final acceptance and handoff

- Published fork release: https://github.com/vickioo/RAYLINE/releases/tag/v0.1.11 (September 30, 2026, 23:47 China Standard Time).
- GitHub reports the uploaded DMG as 180,351,498 bytes with the exact SHA-256 above. The release tag resolves to the packaged source commit `8a72e5e`. The fork packaging workflow was temporarily paused around publication and restored, preventing another build from replacing the verified asset.
- Final self-check repeated all 28 regression tests, changed-file ESLint and theme validation. An isolated cold start of the staged application reconfirmed 72-option parity across conversation and all three dispatch controls, five GPT-6.1 effort choices, Grok 4.7 selection/default inheritance, nested Escape, draft reload and native terminal execution, with zero renderer errors. Strict/deep signature checks passed after terminal exit. A fresh read-only DMG mount passed signature verification and matched the staged app.asar hash; the test app and mounts were closed.
- Upstream PR #230 now describes the shared picker, runtime availability, Grok verification and signed-bundle history fix, alongside the earlier desktop consolidation.
- The one-time local transition waits for active agents to finish before a normal quit, private profile/application backup and replacement. It revalidates the staged signature/hash immediately before switching and checks renderer startup, terminal bridge availability and signature after launch. Its local receipt records the outcome; an eligible startup failure restores the previous bundle.
- At the user's request, work stops after this handoff and enters overnight standby. This means no further development, autonomous agent work or repeated monitoring is scheduled. The one-time installation transition is the sole pending local action; this record does not claim that the still-running chat has already switched versions.
