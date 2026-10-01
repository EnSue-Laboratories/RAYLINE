/**
 * Codex CLI `codex exec --json` event shapes (openai/codex
 * `codex-rs/exec/src/exec_events.rs`, CLI 0.153–0.160), forwarded verbatim on
 * `agent-stream` by electron/codex-agent-manager.
 *
 * Also covers the legacy rollout / session-file events (`session_meta`,
 * `event_msg`, `response_item`) that the renderer still handles and that
 * electron/session-reader parses out of ~/.codex/sessions/*.jsonl.
 */

// ── exec --json (current) ───────────────────────────────────────────────────

export interface CodexUsage {
  input_tokens: number;
  cached_input_tokens?: number;
  cache_write_input_tokens?: number;
  output_tokens: number;
  reasoning_output_tokens?: number;
  /** Older CLIs. */
  total_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

export interface CodexThreadStartedEvent {
  type: "thread.started";
  thread_id: string;
}

export interface CodexTurnStartedEvent {
  type: "turn.started";
}

export interface CodexTurnCompletedEvent {
  type: "turn.completed";
  usage?: CodexUsage;
}

export interface CodexTurnFailedEvent {
  type: "turn.failed";
  error?: { message?: string };
  message?: string;
}

/** Top-level stream error (e.g. auth / model errors). */
export interface CodexStreamErrorEvent {
  type: "error";
  message: string;
}

export type CodexItemStatus = "in_progress" | "completed" | "failed" | "declined";

export interface CodexAgentMessageItem {
  id: string;
  type: "agent_message";
  text: string;
}

export interface CodexReasoningItem {
  id: string;
  type: "reasoning";
  text: string;
}

export interface CodexCommandExecutionItem {
  id: string;
  type: "command_execution";
  command: string;
  aggregated_output: string;
  exit_code?: number | null;
  status?: CodexItemStatus;
}

export type CodexPatchChangeKind = "add" | "delete" | "update";

export interface CodexFileChangeItem {
  id: string;
  type: "file_change";
  changes: { path: string; kind: CodexPatchChangeKind }[];
  status?: CodexItemStatus;
}

export interface CodexMcpToolCallItem {
  id: string;
  type: "mcp_tool_call";
  server: string;
  tool: string;
  arguments?: unknown;
  result?: unknown;
  error?: { message: string } | null;
  status?: CodexItemStatus;
}

/** Sub-agent / delegation tool call (newer CLIs; field set unverified). */
export interface CodexCollabToolCallItem {
  id: string;
  type: "collab_tool_call";
  tool?: string;
  prompt?: string;
  status?: CodexItemStatus;
}

export interface CodexWebSearchItem {
  id: string;
  type: "web_search";
  query: string;
}

export interface CodexTodoListItem {
  id: string;
  type: "todo_list";
  items: { text: string; completed: boolean }[];
}

export interface CodexErrorItem {
  id: string;
  type: "error";
  message: string;
}

export type CodexThreadItem =
  | CodexAgentMessageItem
  | CodexReasoningItem
  | CodexCommandExecutionItem
  | CodexFileChangeItem
  | CodexMcpToolCallItem
  | CodexCollabToolCallItem
  | CodexWebSearchItem
  | CodexTodoListItem
  | CodexErrorItem;

export type CodexThreadItemType = CodexThreadItem["type"];

export interface CodexItemEvent {
  type: "item.started" | "item.updated" | "item.completed";
  item: CodexThreadItem;
}

export type CodexExecEvent =
  | CodexThreadStartedEvent
  | CodexTurnStartedEvent
  | CodexTurnCompletedEvent
  | CodexTurnFailedEvent
  | CodexStreamErrorEvent
  | CodexItemEvent;

// ── Legacy rollout / session-file events ────────────────────────────────────

export interface CodexSessionMetaEvent {
  type: "session_meta";
  payload: { id: string; cwd?: string; timestamp?: string };
}

export interface CodexRawTokenUsage {
  input_tokens?: number;
  cached_input_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  output_tokens?: number;
  reasoning_output_tokens?: number;
  total_tokens?: number;
}

export interface CodexTokenInfo {
  last_token_usage?: CodexRawTokenUsage;
  total_token_usage?: CodexRawTokenUsage;
  model_context_window?: number;
}

export interface CodexRawRateLimitWindow {
  used_percent?: number;
  resets_at?: number;
  window_minutes?: number;
}

export interface CodexRawRateLimits {
  /** 5-hour window (window_minutes = 300). */
  primary?: CodexRawRateLimitWindow | null;
  /** 7-day window (window_minutes = 10080). */
  secondary?: CodexRawRateLimitWindow | null;
  plan_type?: string;
}

export type CodexEventMsgPayload =
  | { type: "token_count"; info?: CodexTokenInfo | null; rate_limits?: CodexRawRateLimits | null }
  | { type: "task_started"; model_context_window?: number }
  | { type: "task_complete"; last_agent_message?: string | null }
  | { type: "user_message"; message: string };

export interface CodexEventMsgEvent {
  type: "event_msg";
  payload: CodexEventMsgPayload;
}

export interface CodexResponseContentItem {
  type: "input_text" | "output_text" | "input_image" | "output_image" | "image_url" | (string & {});
  text?: string;
  image_url?: string | { url?: string };
}

export type CodexResponseItemPayload =
  | { type: "message"; role: "user" | "assistant" | "system" | "developer"; content: CodexResponseContentItem[] }
  | { type: "function_call" | "custom_tool_call"; name?: string; call_id?: string; arguments?: unknown; input?: unknown; status?: string }
  | { type: "function_call_output" | "custom_tool_call_output"; call_id?: string; output?: unknown }
  | { type: "reasoning"; summary?: unknown[] };

export interface CodexResponseItemEvent {
  type: "response_item";
  payload: CodexResponseItemPayload;
}

export type CodexLegacyEvent = CodexSessionMetaEvent | CodexEventMsgEvent | CodexResponseItemEvent;

/** Everything codex-agent-manager may forward. */
export type CodexCliEvent = CodexExecEvent | CodexLegacyEvent;
