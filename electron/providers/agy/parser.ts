/**
 * Pure normalizer for Google Antigravity CLI `--output-format stream-json`
 * (ported from PR #230): `init`, `step_update` (agent_response text /
 * thinking deltas, tool steps), `result` and `error` become OpenCode-shaped
 * events tagged `provider: "agy"`.
 */

import type { OpenCodeCliEvent, OpenCodeTokens } from "@shared/agent/events";
import { isRecord, readNumber, readRecord, readString, safeJsonParse, type JsonRecord } from "../common/json";

const PROVIDER = "agy" as const;

interface AgyEventBase {
  provider: typeof PROVIDER;
  timestamp: number;
  sessionId?: string;
}

interface AgyToolInfo {
  name: string;
  input: unknown;
}

export interface AgyStreamState {
  sessionId: string | null;
  /** Agent response text streamed so far (to avoid repeating it from `result`). */
  text: string;
  /** Per-step usage of this run (resumed `result` totals include older turns). */
  readonly usage: Map<number, JsonRecord>;
  readonly tools: Map<string, AgyToolInfo>;
  resultSeen: boolean;
  failed: boolean;
}

export function createAgyStreamState(): AgyStreamState {
  return { sessionId: null, text: "", usage: new Map(), tools: new Map(), resultSeen: false, failed: false };
}

function errorText(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  return readString(value, "message");
}

/** Tokens for this run: last step's input + summed output / thinking. */
export function agyRunTokens(usage: readonly JsonRecord[]): OpenCodeTokens | null {
  const last = usage[usage.length - 1];
  if (!last) return null;
  return {
    input: readNumber(last, "input_tokens") ?? 0,
    output: usage.reduce((sum, item) => sum + (readNumber(item, "output_tokens") ?? 0), 0),
    reasoning: usage.reduce((sum, item) => sum + (readNumber(item, "thinking_tokens") ?? 0), 0),
    cache: { read: readNumber(last, "cache_read_tokens") ?? 0, write: 0 },
  };
}

function stepEvents(step: JsonRecord, state: AgyStreamState, base: AgyEventBase): OpenCodeCliEvent[] {
  const out: OpenCodeCliEvent[] = [];
  const stepIndex = readNumber(step, "step_index");
  const usage = readRecord(step, "usage");
  if (usage && stepIndex !== undefined) state.usage.set(stepIndex, usage);

  const textDelta = readString(step, "text_delta");
  if (textDelta !== undefined && step.step_type === "agent_response") {
    state.text += textDelta;
    out.push({ ...base, type: "text", text: textDelta });
  }
  const thinkingDelta = readString(step, "thinking_delta");
  if (thinkingDelta !== undefined) out.push({ ...base, type: "reasoning", reasoning: thinkingDelta });

  if (step.step_type === "tool") {
    const id = `agy-tool-${stepIndex ?? "?"}`;
    const previous = state.tools.get(id);
    const info = readRecord(step, "tool_info") ?? {};
    const name = readString(info, "name") || readString(step, "tool_name") || previous?.name || "tool";
    const input = info.parameters ?? previous?.input ?? {};
    state.tools.set(id, { name, input });
    const output = info.output;
    out.push({
      ...base,
      type: "tool_use",
      id,
      name,
      input,
      ...(output !== undefined && output !== null ? { output } : {}),
      status: step.state === "DONE" ? "completed" : "in_progress",
    });
  }
  return out;
}

function resultEvents(result: JsonRecord, state: AgyStreamState, base: AgyEventBase): OpenCodeCliEvent[] {
  state.resultSeen = true;
  const out: OpenCodeCliEvent[] = [];
  const response = readString(result, "response");
  if (result.status !== "SUCCESS") {
    state.failed = true;
    const message = errorText(result.error) || response || `AGY ended with status ${readString(result, "status") || "unknown"}.`;
    out.push({ ...base, type: "error", message });
  } else if (!state.text && response !== undefined) {
    state.text = response;
    out.push({ ...base, type: "text", text: response });
  }
  const tokens = agyRunTokens([...state.usage.values()]);
  out.push({ ...base, type: "step_finish", reason: state.failed ? "error" : "end_turn", ...(tokens ? { part: { tokens } } : {}) });
  return out;
}

/** One parsed AGY event → zero or more OpenCode-shaped events. */
export function normalizeAgyEvent(raw: unknown, state: AgyStreamState, now = Date.now()): OpenCodeCliEvent[] {
  if (!isRecord(raw)) return [];
  const step = readRecord(raw, "step_update");
  const result = readRecord(raw, "result");
  state.sessionId =
    readString(raw, "conversation_id") || readString(step, "conversation_id") || readString(result, "conversation_id") || state.sessionId;
  const base: AgyEventBase = { provider: PROVIDER, timestamp: now, ...(state.sessionId ? { sessionId: state.sessionId } : {}) };

  switch (raw.event) {
    case "init":
      return [{ ...base, type: "step_start" }];
    case "step_update":
      return step ? stepEvents(step, state, base) : [];
    case "result":
      return result ? resultEvents(result, state, base) : [];
    case "error":
      state.failed = true;
      return [{ ...base, type: "error", message: errorText(raw.error) || readString(raw, "message") || "AGY run failed." }];
    default:
      return [];
  }
}

/** A stdout line; `isEvent` marks lines that prove the CLI started (`event` key). */
export function parseAgyLine(line: string, state: AgyStreamState, now = Date.now()): { isEvent: boolean; events: OpenCodeCliEvent[] } | null {
  if (!line.trim()) return null;
  const raw = safeJsonParse(line);
  // Human diagnostics are reported from stderr on failure.
  if (raw === undefined) return null;
  return { isEvent: isRecord(raw) && Boolean(raw.event), events: normalizeAgyEvent(raw, state, now) };
}
