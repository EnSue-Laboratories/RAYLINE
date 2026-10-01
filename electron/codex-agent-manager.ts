/**
 * Codex provider — public entry used by electron/main.
 *
 *  - providers/codex/args.ts          pure `codex exec` args, sandbox flags, model/effort
 *  - providers/codex/system-prompt.ts pure prompt wrapper
 *  - providers/codex/mcp.ts           MCP config → `-c mcp_servers…` (TOML-safe)
 *  - providers/codex/parser.ts        pure `exec --json` line parser
 *  - providers/codex/session.ts       process lifecycle
 */

export { cancelAllCodex, cancelCodexAgent, resolveCodexBin, startCodexAgent } from "./providers/codex/session";
