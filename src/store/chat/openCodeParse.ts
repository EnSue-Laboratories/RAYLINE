/**
 * OpenCode event parsing. OpenCode's schema is unversioned, so every reader
 * probes several spellings (see shared/agent/opencode-stream.ts).
 */
import type {
  OpenCodeErrorEvent,
  OpenCodePart,
  OpenCodeReasoningEvent,
  OpenCodeStdoutEvent,
  OpenCodeTextEvent,
  OpenCodeToolUseEvent,
} from "@shared/agent/events";
import type { CodexStreamErrorEvent } from "@shared/agent/codex-stream";
import type { MessagePart, TextPart, ThinkingPart, ToolPart } from "@shared/chat/types";
import { isRecord, pickString } from "./assistant";
import { uid } from "./ids";
import { isFiniteNumber } from "./usage";

type OpenCodeAnyEvent = { type: string; part?: OpenCodePart; id?: string; timestamp?: number };

function eventRecord(event: object): Record<string, unknown> {
  return { ...event };
}

export function extractOpenCodeSessionId(event: object): string | null {
  const record = eventRecord(event);
  const session = isRecord(record.session) ? record.session : {};
  const part = isRecord(record.part) ? record.part : {};
  return pickString(record.sessionID, record.session_id, record.sessionId, session.id, part.sessionID) || null;
}

export function extractOpenCodeText(event: OpenCodeTextEvent | OpenCodeStdoutEvent): string {
  const record = eventRecord(event);
  const part = isRecord(record.part) ? record.part : {};
  return pickString(record.text, record.delta, record.content, record.message, part.text, part.content);
}

export function extractOpenCodeReasoningText(event: OpenCodeReasoningEvent): string {
  const part = event.part ?? {};
  return pickString(event.thinking, event.reasoning, event.text, event.content, part.text, part.content);
}

const OPENCODE_TOOL_NAMES: Readonly<Record<string, string>> = {
  bash: "Bash",
  edit: "Edit",
  grep: "Grep",
  glob: "Glob",
  read: "Read",
  write: "Write",
};

export function normalizeOpenCodeToolName(name: unknown): string {
  const raw = typeof name === "string" ? name : "";
  return OPENCODE_TOOL_NAMES[raw.toLowerCase()] || raw || "tool";
}

export function normalizeOpenCodeToolArgs(name: string, input: unknown): Record<string, unknown> {
  const args: Record<string, unknown> = isRecord(input) ? { ...input } : {};
  if (args.filePath && !args.file_path) args.file_path = args.filePath;
  if (name === "Bash" && args.cmd && !args.command) args.command = args.cmd;
  return args;
}

export function extractOpenCodeTool(event: OpenCodeToolUseEvent): ToolPart {
  const part = event.part ?? {};
  const state = isRecord(part.state) ? part.state : {};
  const name = normalizeOpenCodeToolName(pickString(event.tool, event.name, part.tool, part.name, part.type));
  const input = event.input ?? state.input ?? part.input ?? part.args ?? part.parameters ?? {};
  const output = event.output ?? state.output ?? part.output ?? part.result ?? null;
  const status = pickString(state.status, part.status, event.status);
  const stateTime = isRecord(state.time) ? state.time : {};
  const startedAt = [stateTime.start, part.time?.start, event.timestamp].find((value) => typeof value === "number" && value !== 0);
  return {
    type: "tool",
    id: pickString(event.callID, part.callID, event.id, part.id) || `oc${uid()}`,
    name,
    args: normalizeOpenCodeToolArgs(name, input),
    result: output ?? state.error ?? null,
    status: status === "completed" || output != null ? "done" : "running",
    _opencodeTime: typeof startedAt === "number" ? startedAt : Date.now(),
  };
}

export function buildOpenCodeTextPart(event: OpenCodeTextEvent | OpenCodeStdoutEvent): TextPart | null {
  const record: OpenCodeAnyEvent = event;
  const part = record.part ?? {};
  const text = event.type === "opencode_stdout" ? event.text : extractOpenCodeText(event);
  if (!text) return null;
  return {
    type: "text",
    id: pickString(part.id, record.id) || `oct${uid()}`,
    text,
    _opencodeTime: part.time?.start || record.timestamp || Date.now(),
  };
}

export function buildOpenCodeThinkingPart(event: OpenCodeReasoningEvent): ThinkingPart | null {
  const part = event.part ?? {};
  const text = extractOpenCodeReasoningText(event);
  if (!text) return null;
  const startedAt = Number(part.time?.start);
  const endedAt = Number(part.time?.end);
  const thinking: ThinkingPart = {
    type: "thinking",
    id: pickString(part.id, event.id) || `ocr${uid()}`,
    text,
    _opencodeTime: Number.isFinite(startedAt) ? startedAt : event.timestamp || Date.now(),
  };
  if (Number.isFinite(startedAt) && Number.isFinite(endedAt) && endedAt >= startedAt) thinking.durationMs = endedAt - startedAt;
  return thinking;
}

const THINK_TAG_RE = /<(?<tag>think|thinking|antThinking)\b[^>]*>(?<text>[\s\S]*?)<\/\k<tag>>/gi;

/** Split `<think>…</think>` spans (and `Thinking:` stdout lines) out of OpenCode text. */
export function splitOpenCodeTextAndThinkingParts(event: OpenCodeTextEvent | OpenCodeStdoutEvent): (TextPart | ThinkingPart)[] {
  const textPart = buildOpenCodeTextPart(event);
  if (!textPart) return [];
  const rawText = textPart.text;
  const trimmed = rawText.trim();

  if (event.type === "opencode_stdout" && /^Thinking:\s*/i.test(trimmed)) {
    return [{ ...textPart, type: "thinking", id: `${textPart.id}-thinking`, text: trimmed.replace(/^Thinking:\s*/i, "") }];
  }

  const pieces: (TextPart | ThinkingPart)[] = [];
  let lastIndex = 0;
  for (const match of rawText.matchAll(THINK_TAG_RE)) {
    const before = rawText.slice(lastIndex, match.index);
    if (before.trim()) pieces.push({ ...textPart, id: `${textPart.id}-text-${pieces.length}`, text: before });
    const thinkingText = (match.groups?.text ?? "").trim();
    if (thinkingText) pieces.push({ ...textPart, type: "thinking", id: `${textPart.id}-thinking-${pieces.length}`, text: thinkingText });
    lastIndex = match.index + match[0].length;
  }
  const after = rawText.slice(lastIndex);
  if (after.trim()) pieces.push({ ...textPart, id: `${textPart.id}-text-${pieces.length}`, text: after });
  return pieces.length > 0 ? pieces : [textPart];
}

function partTime(part: MessagePart): number {
  const time = part.type === "status" ? undefined : part._opencodeTime;
  return isFiniteNumber(time) ? time : Number.POSITIVE_INFINITY;
}

/** Stable in-place sort by OpenCode start time (parts without one keep their order at the end). */
export function sortOpenCodeParts(parts: MessagePart[]): void {
  parts.sort((a, b) => {
    const at = partTime(a);
    const bt = partTime(b);
    return at === bt ? 0 : at - bt;
  });
}

export function extractOpenCodeError(event: OpenCodeErrorEvent | CodexStreamErrorEvent): string {
  const record = eventRecord(event);
  const error = record.error;
  const errorRecord = isRecord(error) ? error : {};
  const data = isRecord(errorRecord.data) ? errorRecord.data : {};
  return pickString(record.message, error, errorRecord.message, data.message) || "OpenCode run failed.";
}
