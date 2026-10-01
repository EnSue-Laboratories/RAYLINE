/**
 * Pure normalizer for xAI Grok Build CLI `--output-format streaming-json`
 * lines (ported from PR #230). Grok events become OpenCode-shaped events
 * tagged `provider: "grok"`, so the renderer reuses its OpenCode branch
 * (adjacent text / reasoning deltas are merged into paragraphs there).
 * Absent fields are omitted, never sent as null.
 */

import type { OpenCodeCliEvent, OpenCodeErrorEvent, OpenCodePart, OpenCodeTokens } from "@shared/agent/events";
import { isRecord, readNumber, readString, safeJsonParse, type JsonRecord } from "../common/json";

const PROVIDER = "grok";

interface GrokToolInfo {
  name: string;
  input: unknown;
}

export interface GrokStreamState {
  sessionId: string | null;
  readonly tools: Map<string, GrokToolInfo>;
  toolSeq: number;
  usageSeq: number;
}

export function createGrokStreamState(sessionId: string | null = null): GrokStreamState {
  return { sessionId, tools: new Map(), toolSeq: 1, usageSeq: 1 };
}

function eventSessionId(event: JsonRecord): string | undefined {
  return readString(event, "sessionId") || readString(event, "session_id") || undefined;
}

function explicitToolName(event: JsonRecord): string | undefined {
  return readString(event, "toolName") || readString(event, "tool_name") || readString(event, "kind") || readString(event, "title") || undefined;
}

function toolCallId(event: JsonRecord, state: GrokStreamState): string {
  return readString(event, "toolCallId") || readString(event, "tool_call_id") || readString(event, "id") || `grok-tool-${state.toolSeq++}`;
}

function eventText(event: JsonRecord): string {
  return typeof event.data === "string" ? event.data : readString(event, "text") || "";
}

/** Grok usage (snake or camel case) → OpenCode token counts. */
export function toGrokTokens(usage: unknown): OpenCodeTokens | null {
  if (!isRecord(usage)) return null;
  const pick = (snake: string, camel: string): number | undefined => readNumber(usage, snake) ?? readNumber(usage, camel);
  const tokens: OpenCodeTokens = {
    input: pick("input_tokens", "inputTokens") ?? 0,
    output: pick("output_tokens", "outputTokens") ?? 0,
    reasoning: pick("reasoning_tokens", "reasoningTokens") ?? 0,
    cache: {
      read: pick("cache_read_input_tokens", "cacheReadInputTokens") ?? 0,
      write: pick("cache_creation_input_tokens", "cacheCreationInputTokens") ?? 0,
    },
  };
  const total = pick("total_tokens", "totalTokens");
  if (total !== undefined) tokens.total = total;
  return tokens;
}

function usagePart(event: JsonRecord, id: string, tokens: OpenCodeTokens): OpenCodePart {
  const cost = readNumber(event, "total_cost_usd");
  return { id, tokens, ...(cost !== undefined ? { cost } : {}) };
}

/** One parsed Grok event → zero or more OpenCode-shaped events. */
export function normalizeGrokEvent(raw: unknown, state: GrokStreamState, now = Date.now()): OpenCodeCliEvent[] {
  if (!isRecord(raw)) return [];
  const sessionId = eventSessionId(raw);
  if (sessionId) state.sessionId = sessionId;
  const base = { provider: PROVIDER, timestamp: now } as const;

  switch (raw.type) {
    case "text": {
      const text = eventText(raw);
      return text ? [{ ...base, type: "text", text }] : [];
    }
    case "thought": {
      const reasoning = eventText(raw);
      return reasoning ? [{ ...base, type: "reasoning", reasoning }] : [];
    }
    case "tool_call": {
      const id = toolCallId(raw, state);
      const name = explicitToolName(raw) ?? "tool";
      const input = raw.rawInput ?? raw.input ?? {};
      state.tools.set(id, { name, input });
      return [{ ...base, type: "tool_use", id, name, input, status: readString(raw, "status") || "in_progress" }];
    }
    case "tool_call_update": {
      const id = toolCallId(raw, state);
      const previous = state.tools.get(id);
      const name = explicitToolName(raw) ?? previous?.name ?? "tool";
      const input = raw.rawInput ?? raw.input ?? previous?.input ?? {};
      if (!previous) state.tools.set(id, { name, input });
      const output = raw.rawOutput ?? raw.output ?? raw.content;
      return [
        {
          ...base,
          type: "tool_use",
          id,
          name,
          input,
          ...(output !== undefined && output !== null ? { output } : {}),
          status: readString(raw, "status") || "completed",
        },
      ];
    }
    case "usage": {
      const tokens = toGrokTokens(raw.usage);
      if (!tokens) return [];
      const partId = readString(raw, "messageId") || `grok-usage-${state.usageSeq++}`;
      return [{ ...base, type: "step_finish", reason: readString(raw, "stopReason") || "usage", part: usagePart(raw, partId, tokens) }];
    }
    case "end": {
      const tokens = toGrokTokens(raw.usage);
      const part = tokens ? usagePart(raw, readString(raw, "requestId") || `grok-end-${state.usageSeq++}`, tokens) : undefined;
      return [
        {
          ...base,
          type: "step_finish",
          reason: readString(raw, "stopReason") || "end_turn",
          ...(state.sessionId ? { sessionId: state.sessionId } : {}),
          ...(part ? { part } : {}),
        },
      ];
    }
    case "error": {
      const message = readString(raw, "message") || readString(raw, "error") || "Grok run failed.";
      const error: OpenCodeErrorEvent = { ...base, type: "error", message, error: message, ...(state.sessionId ? { sessionId: state.sessionId } : {}) };
      return [error];
    }
    default:
      return [];
  }
}

export type GrokStdoutLine = { kind: "events"; events: OpenCodeCliEvent[] } | { kind: "text"; event: OpenCodeCliEvent };

/** JSON lines are normalized; anything else is shown as plain text. */
export function parseGrokLine(line: string, state: GrokStreamState, now = Date.now()): GrokStdoutLine | null {
  if (!line.trim()) return null;
  const raw = safeJsonParse(line);
  if (raw === undefined) return { kind: "text", event: { type: "text", provider: PROVIDER, text: `${line}\n`, timestamp: now } };
  return { kind: "events", events: normalizeGrokEvent(raw, state, now) };
}
