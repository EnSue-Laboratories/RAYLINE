# CLI & model research (2026-10-01)

Claude Code 2.1.287 accepts every flag RayLine passes, so nothing on the Claude side needs changing. But RayLine's sandboxed Codex mode is broken today: codex 0.153.4 rejects `--full-auto`, and `gpt-5.4` is no longer in the Codex model list.

## 1. Claude Code (local 2.1.287)

**Aliases for `--model`** (source: code.claude.com/docs/en/model-config, and `claude --help` names `fable`, `opus`, `sonnet`):

| Alias | Resolves to (Anthropic API) |
|---|---|
| `default` | Clears any override. Pro/Max/Team/API accounts get `claude-opus-5-5` |
| `best` | `fable` where available, otherwise `opus` |
| `fable` | `claude-fable-5-1` (the Claude apps gateway gives `claude-fable-5`) |
| `opus` | `claude-opus-5-5` (Microsoft Foundry: `claude-opus-4-6`) |
| `sonnet` | `claude-sonnet-5-5` (Bedrock/Vertex: `claude-sonnet-4-5`; Claude Platform on AWS: `claude-sonnet-4-6`) |
| `haiku` | Not stated in the Claude Code docs. Probably `claude-haiku-4-5`, based on the env-var example (unverified) |
| `opusplan` | Opus while planning, Sonnet while executing |
| `fable[1m]`, `opus[1m]`, `sonnet[1m]` | 1M variants. `sonnet[1m]` has no effect on Sonnet 5.5, which is already 1M |

**Current models** (source: platform.claude.com/docs/en/about-claude/models/overview):

| Model | ID | Context | Max output | Default effort |
|---|---|---|---|---|
| Fable 5.1 | `claude-fable-5-1` | 1M | 128K | high |
| Opus 5.5 | `claude-opus-5-5` | 1M | 128K | medium |
| Sonnet 5.5 | `claude-sonnet-5-5` | 1M | 128K | high |
| Haiku 4.5 | `claude-haiku-4-5` (alias of `claude-haiku-4-5-20251001`) | 200K | 64K | not supported |

- **Opus 5.5 context window is disputed.** The platform docs and the Opus 5.5 model page say 1M. The Claude Code model-config page says "200K (Anthropic API), no `[1m]` variant", while also listing `opus[1m]`. I couldn't settle this. Until it's confirmed, treat Opus 5.5 as 1M, and check what `opus[1m]` actually does with it.
- **Haiku 4.5** has a retirement date of "not sooner than Oct 15, 2026".

**Effort**
- `--effort` accepts `low`, `medium`, `high`, `xhigh`, `max`, and `ultracode` (`ultracode` means xhigh plus workflows, v2.1.203+). Source: `claude --help` and the CLI reference.
- Opus 4.6 and Sonnet 4.6 don't support `xhigh`.
- The environment-variable equivalent is `CLAUDE_CODE_EFFORT_LEVEL`, which rejects `max` and `ultracode`.

**Thinking**
- Thinking can't be turned off on Opus 5.5, Sonnet 5.5 or Fable; `MAX_THINKING_TOKENS=0` is ignored for them (model-config).
- Opus 5.5 sends the text between tool calls back as `thinking` blocks, which are empty by default (Opus 5.5 model page). RayLine's progress text may go quiet between tool calls. How the CLI shows this in stream-json is unverified.

**Streaming and session flags** (source: `claude --help` and the CLI reference)
- Streaming: `-p --input-format stream-json --output-format stream-json --verbose --include-partial-messages`. Optional: `--replay-user-messages`.
- Session: `--resume <id|name|path>`, `--session-id <uuid>`, `--fork-session`.
- `--permission-mode` accepts `default` (now shown as `manual`), `acceptEdits`, `plan`, `auto`, `dontAsk`, `bypassPermissions`.
- New: `--permission-prompts host|none` (v2.1.259+), `--forward-subagent-text` (v2.1.211+), `--include-hook-events`, `--fallback-model a,b`, `--autocompact`, `--prompt-suggestions`.

**`electron/agent-manager.cjs`:** all its flags are still valid.
- `--permission-prompt-tool stdio` is documented as taking an MCP tool name. `stdio` is the SDK convention and still parses locally.
- `--rewind-files` (line 846) isn't in `--help` or the CLI reference, but it still parses on 2.1.287.
- Nothing passes `--effort` yet, so it's worth adding.

## 2. Codex CLI (local 0.153.4; latest stable is 0.160.0, per the openai/codex releases)

**Catalog in the local CLI** (source: `codex debug models`, cache fetched 2026-10-01):

| Slug | Default effort | Effort levels |
|---|---|---|
| `gpt-6-astra` | medium | low…xhigh, max, ultra |
| `gpt-5.6-sol` | low | low…ultra |
| `gpt-5.6-terra` | medium | low…ultra |
| `gpt-5.6-luna` | medium | low…max |
| `gpt-5.5` ("Legacy") | medium | low, medium, high, xhigh |

- **Context window:** for every model, `context_window` = 272000 and the effective share is 95%. `max_context_window` = 872000 for all models except `gpt-5.5`, where it's 272000. RayLine's 1,050,000 for `gpt-5.5` is wrong.
- **Hidden entries:** `gpt-reserve` and `codex-auto-review`.
- **Fast tier:** each model also has a `priority` ("Fast") service tier.
- **Effort values:** `minimal` is gone and `max` and `ultra` are new. `ultra` means "Maximum reasoning with automatic task delegation". Effort is passed as `-c model_reasoning_effort="…"`.
- **Your config** sets `model = "gpt-6-astra"`.

**Docs list a newer set** (source: learn.chatgpt.com/docs/models, which developers.openai.com/codex/models now redirects to)
- Recommended: `gpt-6-astra`, `gpt-6.1-sol`, `gpt-6-luna`.
- `gpt-6.1-sol` shipped 2026-09-29 and needs CLI 0.159.1 (changelog), so your 0.153.4 doesn't list it. Update Codex before relying on it.
- `gpt-6-luna` isn't in the local catalog either. I didn't find its version requirement.

**`codex exec --json` events** (source: openai/codex `codex-rs/exec/src/exec_events.rs`)
- Event types: `thread.started {thread_id}`, `turn.started`, `turn.completed {usage}`, `turn.failed {error}`, `item.started|updated|completed {item}`, `error {message}`.
- `usage` fields: `input_tokens`, `cached_input_tokens`, `cache_write_input_tokens`, `output_tokens`, `reasoning_output_tokens`.
- Item types: `agent_message`, `reasoning`, `command_execution`, `file_change`, `mcp_tool_call`, `collab_tool_call`, `web_search`, `todo_list`, `error`.

**Resume, sandbox and approval** (source: `codex exec --help`)
- Resume: `codex exec resume <id|name> [prompt]` or `--last` / `--all`. Resume doesn't take `-C` or `-s`.
- `-s read-only|workspace-write|danger-full-access`, `--approve-for-me` (new), `--dangerously-bypass-approvals-and-sandbox` (alias `--yolo`).
- `-a` is rejected by `codex exec` locally, even though the docs list it there. It only works at the top level, with values `on-request` and `never`.

## 3. Deprecated or removed

- **`--full-auto`:** `codex exec` returns "unexpected argument '--full-auto'" (tested locally). RayLine passes it in `electron/codex-agent-manager.cjs:110` (the `CLAUDI_CODEX_BYPASS_SANDBOX=0` path), so that mode fails now. Replace it with `--sandbox workspace-write` or `--approve-for-me`. I couldn't find which version removed it.
- **`gpt-5.4` and `gpt-5.4-mini`:** retired from Codex with ChatGPT sign-in on Aug 31, 2026, and absent from the local catalog. Remove the three `gpt54-*` entries.
- **`gpt-5.5`:** retires from ChatGPT and Codex on Oct 14, 2026.
- **Already deprecated:** `gpt-5.2`, `gpt-5.3-codex`, `gpt-5.3-codex-spark`.
- **Codex parser:** RayLine still handles the legacy `session_meta` and `event_msg/task_complete` events (lines 472–477). They're harmless, but not part of the current schema.
- **Claude Code:** the `--enable-auto-mode` flag was removed in v2.1.111 (use `--permission-mode auto`). `--remote` is now an alias for `--cloud`. The `ANTHROPIC_SMALL_FAST_MODEL` env var is replaced by `ANTHROPIC_DEFAULT_HAIKU_MODEL`. Extended-thinking `budget_tokens` isn't accepted after the 4.6 models.

**Registry changes** for `/Users/kira-chan/Downloads/RAYLINE/src/data/models.js`:
- Add `fable` and `haiku`.
- Set `sonnet` to 1M.
- Settle the Opus 5.5 context question.
- Replace the GPT-5.4 entries with `gpt-6-astra` and `gpt-6.1-sol` (once Codex is updated), plus `gpt-5.6-*` for older installs.
- Correct the Codex context values.