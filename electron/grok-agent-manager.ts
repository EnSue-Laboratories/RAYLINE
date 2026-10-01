/**
 * xAI Grok Build CLI provider (ported from PR #230) — public entry used by
 * electron/main.
 *
 *  - providers/grok/args.ts     pure CLI args (resume / fork / --continue)
 *  - providers/grok/parser.ts   pure streaming-json → OpenCode-shaped events
 *  - providers/grok/session.ts  process lifecycle
 */

export { cancelAllGrok, cancelGrokAgent, resolveGrokBin, startGrokAgent } from "./providers/grok/session";
