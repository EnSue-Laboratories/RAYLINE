/**
 * Pure parser for `codex exec --json` stdout (codex-rs/exec/src/exec_events.rs):
 * `thread.started`, `turn.started|completed|failed`, `item.started|updated|
 * completed` (agent_message, reasoning, command_execution, file_change,
 * mcp_tool_call, collab_tool_call, web_search, todo_list, error) and the
 * top-level `error`. The legacy rollout events (`session_meta`, `event_msg`,
 * `response_item`) are still accepted — older CLIs print them and the guard
 * is cheap.
 */

import type {
  CodexCliEvent,
  CodexEventMsgEvent,
  CodexItemEvent,
  CodexResponseItemEvent,
  CodexSessionMetaEvent,
  CodexStreamErrorEvent,
  CodexThreadItemType,
  CodexThreadStartedEvent,
  CodexTurnCompletedEvent,
  CodexTurnFailedEvent,
  CodexTurnStartedEvent,
} from "@shared/agent/events";
import { isRecord, readNonEmptyString, readString, safeJsonParse } from "../common/json";

export type CodexStdoutLine =
  | { kind: "event"; event: CodexCliEvent }
  | { kind: "ignored"; type: string }
  | { kind: "invalid"; preview: string };

const ITEM_TYPES: ReadonlySet<string> = new Set<CodexThreadItemType>([
  "agent_message",
  "reasoning",
  "command_execution",
  "file_change",
  "mcp_tool_call",
  "collab_tool_call",
  "web_search",
  "todo_list",
  "error",
]);

export function isCodexThreadStarted(value: unknown): value is CodexThreadStartedEvent {
  return isRecord(value) && value.type === "thread.started" && typeof value.thread_id === "string";
}

export function isCodexTurnStarted(value: unknown): value is CodexTurnStartedEvent {
  return isRecord(value) && value.type === "turn.started";
}

export function isCodexTurnCompleted(value: unknown): value is CodexTurnCompletedEvent {
  return isRecord(value) && value.type === "turn.completed" && (value.usage === undefined || isRecord(value.usage));
}

export function isCodexTurnFailed(value: unknown): value is CodexTurnFailedEvent {
  return isRecord(value) && value.type === "turn.failed";
}

export function isCodexStreamError(value: unknown): value is CodexStreamErrorEvent {
  return isRecord(value) && value.type === "error" && typeof value.message === "string";
}

export function isCodexItemEvent(value: unknown): value is CodexItemEvent {
  if (!isRecord(value) || !isRecord(value.item)) return false;
  if (value.type !== "item.started" && value.type !== "item.updated" && value.type !== "item.completed") return false;
  const itemType = value.item.type;
  return typeof value.item.id === "string" && typeof itemType === "string" && ITEM_TYPES.has(itemType);
}

function isSessionMeta(value: unknown): value is CodexSessionMetaEvent {
  return isRecord(value) && value.type === "session_meta" && typeof readString(value.payload, "id") === "string";
}

function isEventMsg(value: unknown): value is CodexEventMsgEvent {
  return isRecord(value) && value.type === "event_msg" && typeof readString(value.payload, "type") === "string";
}

function isResponseItem(value: unknown): value is CodexResponseItemEvent {
  return isRecord(value) && value.type === "response_item" && typeof readString(value.payload, "type") === "string";
}

const GUARDS: ReadonlyArray<(value: unknown) => value is CodexCliEvent> = [
  isCodexThreadStarted,
  isCodexTurnStarted,
  isCodexTurnCompleted,
  isCodexTurnFailed,
  isCodexStreamError,
  isCodexItemEvent,
  isSessionMeta,
  isEventMsg,
  isResponseItem,
];

export function parseCodexLine(line: string): CodexStdoutLine | null {
  if (!line.trim()) return null;
  const raw = safeJsonParse(line);
  const type = readString(raw, "type");
  if (type === undefined) return { kind: "invalid", preview: line.slice(0, 200) };
  for (const guard of GUARDS) {
    if (guard(raw)) return { kind: "event", event: raw };
  }
  return { kind: "ignored", type: isRecord(raw) && isRecord(raw.item) ? `${type}/${String(raw.item.type)}` : type };
}

/** Run bookkeeping derived from one event. */
export interface CodexEventSignals {
  threadId: string | null;
  turnCompleted: boolean;
  /** Fatal error text (top-level `error` / `turn.failed`). */
  errorMessage: string | null;
}

const NONE: CodexEventSignals = { threadId: null, turnCompleted: false, errorMessage: null };

export function inspectCodexEvent(event: CodexCliEvent): CodexEventSignals {
  switch (event.type) {
    case "thread.started":
      return { ...NONE, threadId: event.thread_id || null };
    case "session_meta":
      return { ...NONE, threadId: event.payload.id || null };
    case "turn.completed":
      return { ...NONE, turnCompleted: true };
    case "event_msg":
      return event.payload.type === "task_complete" ? { ...NONE, turnCompleted: true } : NONE;
    case "error":
      return { ...NONE, errorMessage: event.message.trim() || null };
    case "turn.failed":
      return { ...NONE, errorMessage: readNonEmptyString(event.error, "message") ?? readNonEmptyString(event, "message") ?? null };
    case "turn.started":
    case "item.started":
    case "item.updated":
    case "item.completed":
    case "response_item":
      return NONE;
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}

export interface CodexStderrDecision {
  stderr: string;
  exitCode: number | null;
  signal: string | null;
  cancelled: boolean;
  sawTurnCompleted: boolean;
}

export function shouldEmitCodexStderr({ stderr, exitCode, signal, cancelled, sawTurnCompleted }: CodexStderrDecision): boolean {
  if (!stderr.trim()) return false;
  if (cancelled) return false;
  if (sawTurnCompleted && exitCode === 0 && !signal) return false;
  return exitCode !== 0 || Boolean(signal) || !sawTurnCompleted;
}
