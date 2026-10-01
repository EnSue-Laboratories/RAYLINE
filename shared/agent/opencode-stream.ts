/**
 * OpenCode events forwarded on `agent-stream` by
 * electron/opencode-agent-manager. Two sources share these shapes:
 *  - `opencode run --format json` stdout lines (forwarded verbatim), and
 *  - `opencode serve` SSE events, normalized by `partToOpenCodeEvents()` /
 *    `normalizeOpenCodeServerEvent()` (thinking mode).
 * Non-JSON stdout lines become a synthetic `opencode_stdout` event.
 *
 * OpenCode's schema is not versioned; every field beyond `type` is optional
 * and consumers probe several spellings (see src/store/chat/openCodeParse `extractOpenCode*`).
 *
 * The Grok and Antigravity adapters (electron/grok-agent-manager,
 * electron/agy-agent-manager) normalize their CLIs' output into these same
 * shapes and tag every event with `provider: "grok" | "agy"`. Native OpenCode
 * events carry no `provider`. Adapters should omit (not null) absent fields.
 */

/** Providers whose adapters emit OpenCode-shaped events (tagged via `provider`). */
export type OpenCodeShapedProviderId = "grok" | "agy";

export interface OpenCodePartTime {
  start?: number;
  end?: number;
}

export interface OpenCodeToolState {
  status?: "pending" | "running" | "completed" | "error" | (string & {});
  input?: Record<string, unknown>;
  output?: unknown;
  error?: unknown;
  time?: OpenCodePartTime;
}

export interface OpenCodeTokens {
  input?: number;
  output?: number;
  reasoning?: number;
  total?: number;
  cache?: { read?: number; write?: number };
}

/** An OpenCode message part (`message.part.updated` / run-json `part`). */
export interface OpenCodePart {
  id?: string;
  sessionID?: string;
  messageID?: string;
  type?: "text" | "reasoning" | "tool" | "step-start" | "step-finish" | (string & {});
  text?: string;
  content?: string;
  time?: OpenCodePartTime;
  // tool parts
  tool?: string;
  name?: string;
  callID?: string;
  state?: OpenCodeToolState;
  input?: unknown;
  args?: unknown;
  parameters?: unknown;
  output?: unknown;
  result?: unknown;
  status?: string;
  // step-finish parts
  reason?: string;
  tokens?: OpenCodeTokens;
  cost?: number;
}

interface OpenCodeEventBase {
  /** Set by the Grok / AGY adapters; absent on native OpenCode events. */
  provider?: OpenCodeShapedProviderId;
  part?: OpenCodePart;
  sessionID?: string;
  session_id?: string;
  sessionId?: string;
  session?: { id?: string };
  timestamp?: number;
  id?: string;
}

export interface OpenCodeStepStartEvent extends OpenCodeEventBase {
  type: "step_start";
}

export interface OpenCodeStepFinishEvent extends OpenCodeEventBase {
  type: "step_finish";
  reason?: string;
  status?: string;
}

export interface OpenCodeToolUseEvent extends OpenCodeEventBase {
  type: "tool_use";
  tool?: string;
  name?: string;
  callID?: string;
  input?: unknown;
  output?: unknown;
  status?: string;
}

export interface OpenCodeReasoningEvent extends OpenCodeEventBase {
  type: "reasoning";
  reasoning?: string;
  thinking?: string;
  text?: string;
  content?: string;
}

export interface OpenCodeTextEvent extends OpenCodeEventBase {
  type: "text";
  text?: string;
  delta?: string;
  content?: string;
  message?: string;
}

/**
 * Error event. Also the shape of a Codex top-level `{type:"error", message}`,
 * so `AgentStreamEvent` narrowed on `"error"` yields both.
 */
export interface OpenCodeErrorEvent extends OpenCodeEventBase {
  type: "error";
  message?: string;
  error?: string | { message?: string; data?: { message?: string } };
}

/** Synthetic: a non-JSON stdout line from `opencode run`. */
export interface OpenCodeStdoutEvent {
  type: "opencode_stdout";
  /** Line including its trailing "\n". */
  text: string;
}

export type OpenCodeCliEvent =
  | OpenCodeStepStartEvent
  | OpenCodeStepFinishEvent
  | OpenCodeToolUseEvent
  | OpenCodeReasoningEvent
  | OpenCodeTextEvent
  | OpenCodeErrorEvent
  | OpenCodeStdoutEvent;
