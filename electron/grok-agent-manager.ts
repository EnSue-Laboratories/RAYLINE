/**
 * xAI Grok Build CLI provider (ported from PR #230) — public entry used by
 * electron/main.
 *
 *  - providers/grok/args.ts     pure CLI args (resume / fork / --continue)
 *  - providers/grok/parser.ts   pure streaming-json → OpenCode-shaped events
 *  - providers/grok/session.ts  process lifecycle
 */

import { acceptingEventTarget } from "./providers/common/sink";
import { startGrokAgent as startGrok } from "./providers/grok/session";

export { cancelAllGrok, cancelGrokAgent, resolveGrokBin } from "./providers/grok/session";
export const startGrokAgent = acceptingEventTarget(startGrok);
