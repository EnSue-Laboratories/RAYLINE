/**
 * Codex provider — public entry used by electron/main.
 *
 *  - providers/codex/args.ts          pure `codex exec` args, sandbox flags, model/effort
 *  - providers/codex/system-prompt.ts pure prompt wrapper
 *  - providers/codex/mcp.ts           MCP config → `-c mcp_servers…` (TOML-safe)
 *  - providers/codex/parser.ts        pure `exec --json` line parser
 *  - providers/codex/session.ts       process lifecycle
 */

import { acceptingEventTarget } from "./providers/common/sink";
import { startCodexAgent as startCodex } from "./providers/codex/session";

export { cancelAllCodex, cancelCodexAgent, resolveCodexBin } from "./providers/codex/session";
export const startCodexAgent = acceptingEventTarget(startCodex);
