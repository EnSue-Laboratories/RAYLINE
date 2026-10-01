/**
 * Pure parser for Claude Code `--output-format stream-json` stdout lines.
 *
 * Each line becomes one `ClaudeStdoutLine`: a typed `ClaudeCliEvent` to
 * forward on `agent-stream`, a control-protocol message for the permission
 * bridge, or something to drop. Dropped on purpose (renderer ignores them,
 * and every forwarded event costs an IPC clone plus a reducer pass):
 *  - `system` hook / telemetry subtypes (`hook_started`, `hook_response`,
 *    `thinking_tokens`, `post_turn_summary`…) — hook responses can carry
 *    kilobytes of output each;
 *  - top-level types RayLine does not model (`rate_limit_event`, …).
 */

import type {
  ClaudeAssistantEvent,
  ClaudeCanUseToolRequest,
  ClaudeCliEvent,
  ClaudeRawStreamEvent,
  ClaudeResultEvent,
  ClaudeStreamEventEnvelope,
  ClaudeSystemEvent,
  ClaudeUserEvent,
} from "@shared/agent/events";
import { isRecord, readString, safeJsonParse } from "../common/json";

export type ClaudeStdoutLine =
  | { kind: "event"; event: ClaudeCliEvent }
  | { kind: "permission-request"; requestId: string; request: ClaudeCanUseToolRequest }
  | { kind: "permission-cancel"; requestId: string | null }
  | { kind: "control-other"; type: string }
  | { kind: "ignored"; type: string; reason: "noise" | "unknown" }
  | { kind: "invalid"; preview: string };

/** `system` subtypes that never reach the renderer. */
export const CLAUDE_NOISE_SYSTEM_SUBTYPES: ReadonlySet<string> = new Set([
  "hook_started",
  "hook_progress",
  "hook_response",
  "thinking_tokens",
  "post_turn_summary",
]);

const RAW_STREAM_EVENT_TYPES: ReadonlySet<string> = new Set<ClaudeRawStreamEvent["type"]>([
  "message_start",
  "content_block_start",
  "content_block_delta",
  "content_block_stop",
  "message_delta",
  "message_stop",
  "ping",
  "error",
]);

export function isClaudeSystemEvent(value: unknown): value is ClaudeSystemEvent {
  return isRecord(value) && value.type === "system" && typeof value.subtype === "string";
}

export function isClaudeAssistantEvent(value: unknown): value is ClaudeAssistantEvent {
  return isRecord(value) && value.type === "assistant" && isRecord(value.message) && Array.isArray(value.message.content);
}

export function isClaudeUserEvent(value: unknown): value is ClaudeUserEvent {
  return isRecord(value) && value.type === "user" && isRecord(value.message);
}

export function isClaudeResultEvent(value: unknown): value is ClaudeResultEvent {
  return isRecord(value) && value.type === "result" && typeof value.subtype === "string" && typeof value.is_error === "boolean";
}

export function isClaudeStreamEventEnvelope(value: unknown): value is ClaudeStreamEventEnvelope {
  if (!isRecord(value) || value.type !== "stream_event" || !isRecord(value.event)) return false;
  const innerType = value.event.type;
  return typeof innerType === "string" && RAW_STREAM_EVENT_TYPES.has(innerType);
}

function isCanUseToolRequest(value: unknown): value is ClaudeCanUseToolRequest {
  return isRecord(value) && value.subtype === "can_use_tool" && typeof value.tool_name === "string";
}

function preview(line: string): string {
  return line.length > 200 ? line.slice(0, 200) : line;
}

/** Parses one stdout line; null for blank lines. */
export function parseClaudeStdoutLine(line: string): ClaudeStdoutLine | null {
  if (!line.trim()) return null;
  const raw = safeJsonParse(line);
  const type = readString(raw, "type");
  if (!isRecord(raw) || type === undefined) return { kind: "invalid", preview: preview(line) };

  switch (type) {
    case "system":
      if (!isClaudeSystemEvent(raw)) return { kind: "invalid", preview: preview(line) };
      return CLAUDE_NOISE_SYSTEM_SUBTYPES.has(raw.subtype)
        ? { kind: "ignored", type: `system/${raw.subtype}`, reason: "noise" }
        : { kind: "event", event: raw };
    case "assistant":
      return isClaudeAssistantEvent(raw) ? { kind: "event", event: raw } : { kind: "invalid", preview: preview(line) };
    case "user":
      return isClaudeUserEvent(raw) ? { kind: "event", event: raw } : { kind: "invalid", preview: preview(line) };
    case "result":
      return isClaudeResultEvent(raw) ? { kind: "event", event: raw } : { kind: "invalid", preview: preview(line) };
    case "stream_event":
      return isClaudeStreamEventEnvelope(raw)
        ? { kind: "event", event: raw }
        : { kind: "ignored", type: `stream_event/${readString(raw.event, "type") ?? "?"}`, reason: "unknown" };
    case "control_request": {
      const requestId = readString(raw, "request_id");
      if (requestId && isCanUseToolRequest(raw.request)) {
        return { kind: "permission-request", requestId, request: raw.request };
      }
      return { kind: "control-other", type };
    }
    case "control_cancel_request":
      return {
        kind: "permission-cancel",
        requestId: readString(raw, "request_id") || readString(raw, "cancel_request_id") || null,
      };
    case "control_response":
      return { kind: "control-other", type };
    default:
      return { kind: "ignored", type, reason: "unknown" };
  }
}

/** What the run lifecycle needs to know about a forwarded event. */
export interface ClaudeEventSignals {
  /** Thinking delta (logged less verbosely). */
  thinkingDelta: boolean;
  /** Assistant text appeared (first-token timing). */
  assistantText: boolean;
  /** Name of a tool whose `tool_use` block just started. */
  toolUseStarted: string | null;
  /** A content block finished streaming. */
  blockStopped: boolean;
  result: ClaudeResultEvent | null;
}

const NO_SIGNALS: ClaudeEventSignals = {
  thinkingDelta: false,
  assistantText: false,
  toolUseStarted: null,
  blockStopped: false,
  result: null,
};

function rawStreamSignals(inner: ClaudeRawStreamEvent): ClaudeEventSignals {
  switch (inner.type) {
    case "content_block_start":
      // Fields beyond the discriminants are trusted shallowly; stay defensive.
      return inner.content_block?.type === "tool_use"
        ? { ...NO_SIGNALS, toolUseStarted: inner.content_block.name || "tool" }
        : NO_SIGNALS;
    case "content_block_delta":
      if (inner.delta?.type === "thinking_delta") return { ...NO_SIGNALS, thinkingDelta: true };
      return inner.delta?.type === "text_delta" && inner.delta.text ? { ...NO_SIGNALS, assistantText: true } : NO_SIGNALS;
    case "content_block_stop":
      return { ...NO_SIGNALS, blockStopped: true };
    case "message_start":
    case "message_delta":
    case "message_stop":
    case "ping":
    case "error":
      return NO_SIGNALS;
    default: {
      const exhaustive: never = inner;
      return exhaustive;
    }
  }
}

export function inspectClaudeEvent(event: ClaudeCliEvent): ClaudeEventSignals {
  switch (event.type) {
    case "stream_event":
      return rawStreamSignals(event.event);
    case "assistant":
      return event.message.content.some((block) => block?.type === "text" && typeof block.text === "string" && block.text.length > 0)
        ? { ...NO_SIGNALS, assistantText: true }
        : NO_SIGNALS;
    case "result":
      return { ...NO_SIGNALS, result: event };
    case "system":
    case "user":
      return NO_SIGNALS;
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}

/** Compact result summary for logs. */
export function summarizeClaudeResult(event: ClaudeResultEvent | null): Record<string, unknown> | null {
  if (!event) return null;
  return {
    subtype: event.subtype,
    is_error: event.is_error,
    stop_reason: event.stop_reason,
    terminal_reason: event.terminal_reason,
    session_id: event.session_id,
  };
}

export interface ClaudeStderrDecision {
  stderr: string;
  result: ClaudeResultEvent | null;
  exitCode: number | null;
  signal: string | null;
  cancelled: boolean;
  stoppedForQuestion: boolean;
}

/** Whether accumulated stderr should be surfaced as `agent-error`. */
export function shouldEmitClaudeStderr({ stderr, result, exitCode, signal, cancelled, stoppedForQuestion }: ClaudeStderrDecision): boolean {
  if (!stderr.trim()) return false;
  if (cancelled || stoppedForQuestion) return false;
  if (result?.is_error || result?.subtype === "error_during_execution") return true;
  return !result && (exitCode !== 0 || Boolean(signal));
}
