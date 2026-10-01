/**
 * Claude Code `--output-format stream-json --verbose --include-partial-messages`
 * event shapes (Claude Code 2.1.x), as read by electron/agent-manager and
 * src/hooks/useAgent. Only fields RayLine reads are required; the CLI emits
 * more, which is why most fields beyond the discriminants are optional.
 */

// ── Messages API content blocks ─────────────────────────────────────────────

export interface ClaudeTextBlock {
  type: "text";
  text: string;
}

export interface ClaudeThinkingBlock {
  type: "thinking";
  thinking: string;
  signature?: string;
}

export interface ClaudeRedactedThinkingBlock {
  type: "redacted_thinking";
  data: string;
}

export interface ClaudeToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ClaudeToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content?: string | ClaudeContentBlock[];
  is_error?: boolean;
}

export interface ClaudeBase64ImageSource {
  type: "base64";
  media_type: string;
  data: string;
}

export interface ClaudeUrlImageSource {
  type: "url";
  url: string;
}

export interface ClaudeImageBlock {
  type: "image";
  source: ClaudeBase64ImageSource | ClaudeUrlImageSource;
  /** Non-standard, tolerated by the renderer. */
  id?: string;
  alt?: string;
}

/** Blocks RayLine understands. Unknown block types are skipped by consumers. */
export type ClaudeContentBlock =
  | ClaudeTextBlock
  | ClaudeThinkingBlock
  | ClaudeRedactedThinkingBlock
  | ClaudeToolUseBlock
  | ClaudeToolResultBlock
  | ClaudeImageBlock;

export interface ClaudeApiUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  service_tier?: string | null;
}

export interface ClaudeAssistantMessage {
  id?: string;
  type?: "message";
  role: "assistant";
  model?: string;
  content: ClaudeContentBlock[];
  stop_reason?: string | null;
  usage?: ClaudeApiUsage;
}

export interface ClaudeUserMessage {
  role: "user";
  content: string | ClaudeContentBlock[];
}

// ── Raw Messages API stream events (inside `stream_event`) ──────────────────

export interface ClaudeMessageStartEvent {
  type: "message_start";
  message: ClaudeAssistantMessage;
}

export interface ClaudeContentBlockStartEvent {
  type: "content_block_start";
  index: number;
  content_block: ClaudeContentBlock;
}

export interface ClaudeTextDelta {
  type: "text_delta";
  text: string;
}

export interface ClaudeInputJsonDelta {
  type: "input_json_delta";
  partial_json: string;
}

export interface ClaudeThinkingDelta {
  type: "thinking_delta";
  thinking: string;
}

export interface ClaudeSignatureDelta {
  type: "signature_delta";
  signature: string;
}

export type ClaudeContentDelta = ClaudeTextDelta | ClaudeInputJsonDelta | ClaudeThinkingDelta | ClaudeSignatureDelta;

export interface ClaudeContentBlockDeltaEvent {
  type: "content_block_delta";
  index: number;
  delta: ClaudeContentDelta;
}

export interface ClaudeContentBlockStopEvent {
  type: "content_block_stop";
  index: number;
}

export interface ClaudeMessageDeltaEvent {
  type: "message_delta";
  delta: { stop_reason?: string | null; stop_sequence?: string | null };
  /** Cumulative for the current API call. */
  usage?: Partial<ClaudeApiUsage>;
}

export interface ClaudeMessageStopEvent {
  type: "message_stop";
}

export interface ClaudePingEvent {
  type: "ping";
}

export interface ClaudeApiErrorEvent {
  type: "error";
  error: { type: string; message: string };
}

export type ClaudeRawStreamEvent =
  | ClaudeMessageStartEvent
  | ClaudeContentBlockStartEvent
  | ClaudeContentBlockDeltaEvent
  | ClaudeContentBlockStopEvent
  | ClaudeMessageDeltaEvent
  | ClaudeMessageStopEvent
  | ClaudePingEvent
  | ClaudeApiErrorEvent;

// ── Top-level CLI events (forwarded verbatim on `agent-stream`) ─────────────

interface ClaudeCliEventBase {
  session_id?: string;
  uuid?: string;
  parent_tool_use_id?: string | null;
}

/**
 * `system` events. Known subtypes: `init` (first event of a run) and
 * `compact_boundary` (auto-compaction ran). Others (hooks, status) exist.
 */
export interface ClaudeSystemEvent extends ClaudeCliEventBase {
  type: "system";
  subtype: string;
  // init
  cwd?: string;
  model?: string;
  tools?: string[];
  mcp_servers?: { name: string; status: string }[];
  permissionMode?: string;
  apiKeySource?: string;
  claude_code_version?: string;
  // compact_boundary
  compact_metadata?: { trigger?: string; pre_tokens?: number };
}

export interface ClaudeAssistantEvent extends ClaudeCliEventBase {
  type: "assistant";
  message: ClaudeAssistantMessage;
}

export interface ClaudeUserEvent extends ClaudeCliEventBase {
  type: "user";
  message: ClaudeUserMessage;
}

/** `success` | `error_max_turns` | `error_during_execution` | others. */
export type ClaudeResultSubtype = "success" | "error_max_turns" | "error_during_execution" | (string & {});

export interface ClaudeResultEvent extends ClaudeCliEventBase {
  type: "result";
  subtype: ClaudeResultSubtype;
  is_error: boolean;
  /** Final assistant text (success) or error text. */
  result?: string;
  error?: string;
  errors?: string[];
  duration_ms?: number;
  duration_api_ms?: number;
  num_turns?: number;
  total_cost_usd?: number;
  /** Aggregated across every API call in the turn. */
  usage?: ClaudeApiUsage;
  stop_reason?: string | null;
  /** e.g. `hook_stopped` when a hook returned `continue: false`. */
  terminal_reason?: string;
}

export interface ClaudeStreamEventEnvelope extends ClaudeCliEventBase {
  type: "stream_event";
  event: ClaudeRawStreamEvent;
}

/** Events agent-manager forwards to the renderer. */
export type ClaudeCliEvent =
  | ClaudeSystemEvent
  | ClaudeAssistantEvent
  | ClaudeUserEvent
  | ClaudeResultEvent
  | ClaudeStreamEventEnvelope;

// ── Control protocol (`--permission-prompt-tool stdio`; main process only) ──

export interface ClaudeCanUseToolRequest {
  subtype: "can_use_tool";
  tool_name: string;
  input: Record<string, unknown>;
  tool_use_id?: string;
  blocked_path?: string;
  description?: string;
  permission_suggestions?: unknown[];
}

export interface ClaudeControlRequestEvent {
  type: "control_request";
  request_id: string;
  request: ClaudeCanUseToolRequest | { subtype: string };
}

export interface ClaudeControlCancelRequestEvent {
  type: "control_cancel_request";
  request_id?: string;
  cancel_request_id?: string;
}

export interface ClaudeControlResponseEvent {
  type: "control_response";
  response?: unknown;
}

/** Everything that can appear on the CLI's stdout. */
export type ClaudeStdoutEvent =
  | ClaudeCliEvent
  | ClaudeControlRequestEvent
  | ClaudeControlCancelRequestEvent
  | ClaudeControlResponseEvent;

/** Line written to the CLI's stdin to start a turn. */
export interface ClaudeStdinUserMessage {
  type: "user";
  message: { role: "user"; content: string };
}

export type ClaudePermissionDecision =
  | { behavior: "allow"; updatedInput: Record<string, unknown> }
  | { behavior: "deny"; message: string };

/** Line written to the CLI's stdin to answer a `can_use_tool` request. */
export interface ClaudeStdinControlResponse {
  type: "control_response";
  response: {
    subtype: "success";
    request_id: string;
    response: ClaudePermissionDecision;
  };
}
