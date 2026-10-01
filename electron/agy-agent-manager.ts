/**
 * Google Antigravity CLI provider (ported from PR #230) — public entry used
 * by electron/main.
 *
 *  - providers/agy/args.ts     pure CLI args (rejects fork / image payloads)
 *  - providers/agy/parser.ts   pure stream-json → OpenCode-shaped events
 *  - providers/agy/session.ts  process lifecycle (startup watchdog, kill escalation)
 */

import { acceptingEventTarget } from "./providers/common/sink";
import { startAgyAgent as startAgy } from "./providers/agy/session";

export { cancelAgyAgent, cancelAllAgy, resolveAgyBin } from "./providers/agy/session";
export const startAgyAgent = acceptingEventTarget(startAgy);
