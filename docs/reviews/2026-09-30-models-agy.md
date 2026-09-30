# RayLine 0.1.10: GPT-6.1 Sol and Antigravity CLI — 2026-09-30

## Behavior

- GPT-6.1 Sol is available even before local discovery completes. The official model guide lists low, medium, high, xhigh and max reasoning. A compatibility cache that reports only `none` no longer replaces these verified levels. Existing `none` selections migrate to medium while keeping the same model. Runtime context limits still take precedence over the API catalog's 1,050,000-token limit.
- Antigravity (`agy`) is a separate runtime and model group. Its authenticated `agy models` output supplies names and IDs; no account credentials or guessed context windows enter the renderer. Successful model metadata is cached for five minutes and retained on refresh failure; the native default remains available if no catalog has ever been discovered.
- The AGY adapter handles native initialization, text deltas, tool start/completion, errors and completion. Native conversation IDs remain separate from other providers and are used for explicit resume. Per-turn step usage avoids counting prior turns again when the CLI returns cumulative totals.
- AGY inherits explicitly configured proxy environment variables. On macOS, missing HTTP/HTTPS proxy values are filled from the existing system proxy configuration, allowing Finder launches to reach the same services as the user's configured terminal. No proxy settings or login credentials are changed or copied into the repository.
- Existing AGY permissions are respected; the adapter does not add the skip-permissions flag. Native conversation forks and pasted-image payloads are rejected explicitly for this first adapter; local file attachments are passed as paths.
- Packaged agents' terminal helper is now included outside app.asar with its WebSocket dependency. Packaged terminal MCP runs with Electron's Node mode, making the archived MCP implementation readable without relying on a developer checkout.

## Sources and native probes

- GPT-6.1 Sol: https://developers.openai.com/api/docs/models/gpt-6.1-sol
- Antigravity CLI: https://antigravity.google/docs/cli/headless
- Antigravity models: https://antigravity.google/docs/models
- Installed AGY 1.2.14. Native login succeeded; an initial headless run stalled on networking until the existing system proxy was inherited.
- Authenticated discovery returned 14 model rows: Gemini 3.8/3.7/3.6 Flash (High/Medium/Low), Gemini 3.1 Pro (High/Low), Claude Sonnet 4.6 (Thinking), Claude Opus 4.6 (Thinking), and GPT-OSS 120B (Medium).
- A GPT-6.1 Sol Codex CLI request with medium reasoning returned the exact expected marker and exited successfully.
- An AGY no-tool reply succeeded. Explicit conversation resume recovered the previous requested marker. A Gemini 3.8 Flash Low request executed a harmless directory listing in an empty temporary workspace and returned its marker. Native probes and temporary conversation identifiers stay in ignored local output.

## Validation

- Seven focused tests cover GPT-6.1 reasoning fallback and saved selections, AGY catalog isolation, streamed text/tools/usage, completion-only responses/errors, explicit resume and permission preservation, proxy inheritance, and retained discovery across cold starts/network failures.
- Existing eight UI regressions and three persistence tests pass.
- Production renderer build, theme-token validation and changed-file ESLint pass.
- Packaged AGY: a real Gemini 3.8 Flash Low reply, native resume, saved AGY session ID, reload history and UI cancellation (SIGTERM) pass in an isolated profile with a minimal Finder-style environment.
- Packaged GPT-6.1 Sol medium: the exact reply marker and an `agent-done` event with provider `codex` and exit code 0 confirm actual Codex routing. The packaged MCP environment override is emitted as a TOML table, not a JSON string; native config parsing and the actual request both pass.
- The standalone packaged terminal CLI connects successfully to the test application's terminal server; the packaged MCP server completes its initialize handshake using Electron Node mode.
- No renderer page errors observed. Final cold-start model-cache and signature checks follow packaging.
