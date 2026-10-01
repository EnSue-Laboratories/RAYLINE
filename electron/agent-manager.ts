/**
 * Claude Code provider — public entry used by electron/main.
 *
 *  - providers/claude/args.ts          pure CLI args / prompt / model+effort
 *  - providers/claude/system-prompt.ts pure `--append-system-prompt` text
 *  - providers/claude/parser.ts        pure stream-json line parser
 *  - providers/claude/permissions.ts   pure permission-prompt helpers
 *  - providers/claude/session.ts       process lifecycle (spawn / stream / cancel)
 *  - providers/claude/rewind.ts        bin resolution, cwd recovery, --rewind-files
 */

export { cancelAgent, cancelAll, respondPermission, startAgent } from "./providers/claude/session";
export { resolveClaudeBin, rewindFiles } from "./providers/claude/rewind";
