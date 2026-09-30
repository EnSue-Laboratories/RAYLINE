# RayLine 0.1.11: shared model picker and Grok configuration compatibility

## Changes

Conversation, new-chat and dispatch model controls now share `useModelCatalog` and `ModelPicker`. Dispatch's default, per-task and automatic-planning controls support the same search, provider grouping, reasoning labels, keyboard navigation and nested Escape behavior. A per-task selection can inherit the default model, including its reasoning level. Menus use viewport positioning and a portal above the dispatch dialog.

Planning capabilities are declared in one shared manifest and checked by the backend. The current planner supports local Claude, Codex and OpenCode. Other providers remain visible with an explanation and are disabled only for planning; they remain selectable for executing tasks.

Grok static entries are historical identities, not evidence of local availability. Explicit model choices follow `grok models`; unavailable saved choices retain their original model and show an explanation. A native CLI-default option remains usable if discovery fails. Configuring a new model makes it appear on the next discovery. Streamed Grok errors are not repeated when the CLI also writes the error to stderr and exits unsuccessfully.

## Local Grok 4.7 investigation

Installed Grok 1.0.41 initially advertised six configured models and rejected `grok-4.7` before making a provider request. The existing authenticated connection's model catalog included `grok-4.7`. A private backup of the local CLI configuration was made, then an explicit 4.7 entry was added using the same existing connection and the actual `grok-4.7` upstream model ID. The default model and existing entries were preserved. Credentials, endpoints, backups and native session IDs are excluded from this repository and release assets.

A real request through RayLine's Grok adapter, in an empty temporary workspace, returned the exact `RAYLINE_GROK47_OK` marker with exit code 0 and no errors. This proves the configured 4.7 route works locally; availability for other installations still depends on their own CLI catalog.

## Verification

- 26 focused tests passed across model options, Grok catalog/failure behavior, AGY, UI regressions and persistence.
- Theme-token validation and ESLint for changed JavaScript files passed.
- The CLI fixture verifies that an unknown-model error appearing in both JSON and stderr produces exactly one visible error and one completion event.
- Packaged UI and release verification will be recorded after the installation candidate is tested.
