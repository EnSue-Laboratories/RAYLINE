/**
 * Main → renderer agent events (`agent-stream`, `agent-done`, `agent-error`).
 *
 * `agent-stream` carries provider-native events *verbatim* (Claude stream-json,
 * Codex exec --json, OpenCode run/serve JSON, Multica WS frames), Grok / AGY
 * events normalized into the OpenCode shapes (`provider: "grok" | "agy"`), plus a few
 * RayLine-synthesized events. `AgentStreamEvent` is the discriminated union of
 * all of them, keyed by `type`; the renderer reducer (src/hooks/useAgent)
 * switches on it.
 *
 * Note: Codex and OpenCode both emit `{ type: "error" }`; narrowing on
 * `"error"` yields `CodexStreamErrorEvent | OpenCodeErrorEvent`.
 */

import type { RuntimeProviderId } from "../providers/types";
import type { ClaudeCliEvent } from "./claude-stream";
import type { CodexCliEvent } from "./codex-stream";
import type { MulticaStreamEvent } from "./multica-stream";
import { MULTICA_EVENT_PREFIX } from "./multica-stream";
import type { OpenCodeCliEvent } from "./opencode-stream";
import type { RateLimits, TokenUsage } from "./usage";

export type * from "./claude-stream";
export type * from "./codex-stream";
export type * from "./opencode-stream";
export type * from "./usage";
export * from "./multica-stream";

// ── RayLine-synthesized stream events ───────────────────────────────────────

/**
 * Claude Code plan quota, emitted by agent-manager after each `result`
 * (from the OAuth usage endpoint; absent for API-key users).
 */
export interface RateLimitsEvent {
  type: "rate_limits";
  rate_limits: RateLimits;
}

/**
 * Codex usage / quota read back from the session file after the process
 * exits (codex exec --json does not stream `token_count`).
 */
export interface SessionSnapshotEvent {
  type: "session_snapshot";
  provider: "codex";
  thread_id: string;
  usage: TokenUsage | null;
  rate_limits: RateLimits | null;
}

export type RayLineSyntheticEvent = RateLimitsEvent | SessionSnapshotEvent;

/** Every event that can arrive on `agent-stream`. */
export type AgentStreamEvent =
  | ClaudeCliEvent
  | CodexCliEvent
  | OpenCodeCliEvent
  | MulticaStreamEvent
  | RayLineSyntheticEvent;

export type AgentStreamEventType = AgentStreamEvent["type"];

// ── Channel payloads ────────────────────────────────────────────────────────

/** `agent-stream` */
export interface AgentStreamPayload {
  conversationId: string;
  event: AgentStreamEvent;
}

/**
 * `agent-done`. Field presence varies by provider / path:
 *  - Claude: `{ conversationId, exitCode, signal }`
 *  - Codex / OpenCode / Grok / AGY: adds `provider` and `threadId` (native session id)
 *  - Multica: `{ conversationId, provider: "multica" }`
 *  - launch failures: `exitCode: -1`; cancellation: `exitCode: null, signal: "SIGTERM"`
 */
export interface AgentDonePayload {
  conversationId: string;
  exitCode?: number | null;
  signal?: string | null;
  provider?: RuntimeProviderId;
  threadId?: string | null;
}

/** `agent-error` — always followed by `agent-done` for the same run. */
export interface AgentErrorPayload {
  conversationId: string;
  error: string;
}

// ── Guards ──────────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Structural check only (object with a string `type`). Provider events are
 * forwarded verbatim, so deeper validation happens in the reducer branches.
 */
export function isAgentStreamEvent(value: unknown): value is AgentStreamEvent {
  return isRecord(value) && typeof value.type === "string";
}

export function isAgentStreamPayload(value: unknown): value is AgentStreamPayload {
  return isRecord(value) && typeof value.conversationId === "string" && isAgentStreamEvent(value.event);
}

export function isMulticaStreamEvent(event: AgentStreamEvent): event is MulticaStreamEvent {
  return event.type.startsWith(MULTICA_EVENT_PREFIX);
}
