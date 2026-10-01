/**
 * OpenCode provider — public entry used by electron/main.
 *
 *  - providers/opencode/config.ts         pure model / thinking / args / credentials overlay
 *  - providers/opencode/parser.ts         pure run-json + serve SSE normalization
 *  - providers/opencode/runtime-env.ts    env + temporary config directory
 *  - providers/opencode/server-client.ts  `opencode serve` HTTP / SSE client
 *  - providers/opencode/run-session.ts    `opencode run` lifecycle (default)
 *  - providers/opencode/server-session.ts serve lifecycle (thinking mode)
 *  - providers/opencode/registry.ts       active runs, finish, cancel
 */

import { acceptingEventTarget } from "./providers/common/sink";
import { startOpenCodeAgent as startOpenCode } from "./providers/opencode/run-session";

export { resolveOpenCodeBin } from "./providers/opencode/run-session";
export const startOpenCodeAgent = acceptingEventTarget(startOpenCode);
export { cancelAllOpenCode, cancelOpenCodeAgent } from "./providers/opencode/registry";
export { buildOpenCodeEnv, createOpenCodeRuntimeEnv } from "./providers/opencode/runtime-env";
export { shouldEnableThinking } from "./providers/opencode/config";
