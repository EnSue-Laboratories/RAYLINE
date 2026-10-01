/**
 * Pure OpenCode stream parsing:
 *  - `opencode run --format json` stdout lines → `OpenCodeCliEvent`
 *    (non-JSON lines become a synthetic `opencode_stdout` event);
 *  - `opencode serve` SSE events (`message.part.updated`, `message.part.delta`,
 *    `session.error`, …) → the same run-json event shapes.
 */

import type {
  OpenCodeCliEvent,
  OpenCodeErrorEvent,
  OpenCodePart,
  OpenCodeReasoningEvent,
  OpenCodeStepFinishEvent,
  OpenCodeStepStartEvent,
  OpenCodeTextEvent,
  OpenCodeToolUseEvent,
} from "@shared/agent/events";
import { isRecord, readNonEmptyString, readRecord, readString, safeJsonParse } from "../common/json";

type OpenCodeJsonEvent = Exclude<OpenCodeCliEvent, { type: "opencode_stdout" }>;

const RUN_EVENT_TYPES: ReadonlySet<string> = new Set<OpenCodeJsonEvent["type"]>([
  "step_start",
  "step_finish",
  "tool_use",
  "reasoning",
  "text",
  "error",
]);

function isOpenCodeJsonEvent(value: unknown): value is OpenCodeJsonEvent {
  return isRecord(value) && typeof value.type === "string" && RUN_EVENT_TYPES.has(value.type) && (value.part === undefined || isRecord(value.part));
}

export type OpenCodeRunLine =
  | { kind: "event"; event: OpenCodeJsonEvent }
  | { kind: "stdout"; event: OpenCodeCliEvent }
  | { kind: "ignored"; type: string };

export function parseOpenCodeRunLine(line: string): OpenCodeRunLine | null {
  if (!line.trim()) return null;
  const raw = safeJsonParse(line);
  if (raw === undefined) return { kind: "stdout", event: { type: "opencode_stdout", text: `${line}\n` } };
  if (isOpenCodeJsonEvent(raw)) return { kind: "event", event: raw };
  return { kind: "ignored", type: readString(raw, "type") ?? typeof raw };
}

/** Native session id carried by an event (several spellings). */
export function extractOpenCodeSessionId(event: unknown): string | null {
  return (
    readNonEmptyString(event, "sessionID") ??
    readNonEmptyString(event, "session_id") ??
    readNonEmptyString(event, "sessionId") ??
    readNonEmptyString(readRecord(event, "session"), "id") ??
    readNonEmptyString(readRecord(event, "part"), "sessionID") ??
    null
  );
}

export function extractOpenCodeErrorMessage(event: unknown): string | null {
  const error = isRecord(event) ? event.error : undefined;
  return (
    readNonEmptyString(event, "message") ??
    (typeof error === "string" && error.trim() ? error.trim() : undefined) ??
    readNonEmptyString(error, "message") ??
    readNonEmptyString(readRecord(error, "data"), "message") ??
    null
  );
}

// ── serve mode ──────────────────────────────────────────────────────────────

function isOpenCodePart(value: unknown): value is OpenCodePart {
  return isRecord(value) && (value.id === undefined || typeof value.id === "string") && (value.type === undefined || typeof value.type === "string");
}

/** Maps one message part to run-json events (unknown part types → none). */
export function partToOpenCodeEvents(part: OpenCodePart, now = Date.now()): OpenCodeCliEvent[] {
  const base = { part, sessionID: part.sessionID, timestamp: now };
  switch (part.type) {
    case "step-start":
      return [{ ...base, type: "step_start" } satisfies OpenCodeStepStartEvent];
    case "step-finish":
      return [{ ...base, type: "step_finish", reason: part.reason } satisfies OpenCodeStepFinishEvent];
    case "tool":
      return [{ ...base, type: "tool_use" } satisfies OpenCodeToolUseEvent];
    case "reasoning":
      return [{ ...base, type: "reasoning", reasoning: part.text || "" } satisfies OpenCodeReasoningEvent];
    case "text":
      return [{ ...base, type: "text", text: part.text || "" } satisfies OpenCodeTextEvent];
    default:
      return [];
  }
}

/** Per-run bookkeeping for SSE delta reassembly. */
export interface OpenCodeServerStreamState {
  sessionId: string | null;
  readonly messageRoles: Map<string, string>;
  readonly partTypes: Map<string, string>;
  readonly partStarts: Map<string, number>;
  readonly partText: Map<string, string>;
}

export function createOpenCodeServerStreamState(sessionId: string | null): OpenCodeServerStreamState {
  return { sessionId, messageRoles: new Map(), partTypes: new Map(), partStarts: new Map(), partText: new Map() };
}

export function normalizeOpenCodeServerEvent(event: unknown, state: OpenCodeServerStreamState, now = Date.now()): OpenCodeCliEvent[] {
  if (!isRecord(event)) return [];
  const properties = readRecord(event, "properties") ?? {};

  switch (event.type) {
    case "message.updated": {
      const info = readRecord(properties, "info");
      const id = readString(info, "id");
      const role = readString(info, "role");
      if (id && role) state.messageRoles.set(id, role);
      return [];
    }
    case "message.part.updated": {
      const part = properties.part;
      if (!isOpenCodePart(part) || !part.id) return [];
      if (part.messageID && state.messageRoles.get(part.messageID) === "user") return [];
      if (part.sessionID) state.sessionId = part.sessionID;
      if (part.type) state.partTypes.set(part.id, part.type);
      if (part.time?.start) state.partStarts.set(part.id, part.time.start);
      if (typeof part.text === "string") state.partText.set(part.id, part.text);
      return partToOpenCodeEvents(part, now);
    }
    case "message.part.delta": {
      const partID = readString(properties, "partID");
      const messageID = readString(properties, "messageID");
      const delta = readString(properties, "delta") ?? "";
      if (messageID && state.messageRoles.get(messageID) === "user") return [];
      const partType = partID ? state.partTypes.get(partID) : undefined;
      if (!partID || !delta || (partType !== "reasoning" && partType !== "text")) return [];
      const text = `${state.partText.get(partID) ?? ""}${delta}`;
      state.partText.set(partID, text);
      return partToOpenCodeEvents(
        {
          id: partID,
          sessionID: readString(properties, "sessionID"),
          messageID,
          type: partType,
          text,
          time: { start: state.partStarts.get(partID) || now },
        },
        now,
      );
    }
    case "session.error": {
      const errorValue = properties.error;
      const message =
        readString(errorValue, "message") ||
        (typeof errorValue === "string" ? errorValue : "") ||
        readString(properties, "message") ||
        "OpenCode run failed.";
      const errorEvent: OpenCodeErrorEvent = { type: "error", message, error: message, sessionID: readString(properties, "sessionID") };
      return [errorEvent];
    }
    default:
      return [];
  }
}

/** Is this SSE event the end of the prompt we started? */
export function isOpenCodeIdleEvent(event: unknown, sessionId: string | null): boolean {
  if (!isRecord(event)) return false;
  const properties = readRecord(event, "properties");
  const eventSessionId = readString(properties, "sessionID");
  if (eventSessionId && sessionId && eventSessionId !== sessionId) return false;
  if (event.type === "session.idle") return true;
  return event.type === "session.status" && readString(readRecord(properties, "status"), "type") === "idle";
}

/** `permission.updated` → `{ sessionId, permissionId }` to auto-approve. */
export function readPermissionRequest(event: unknown, sessionId: string | null): { sessionId: string; permissionId: string } | null {
  if (!isRecord(event) || event.type !== "permission.updated") return null;
  const properties = readRecord(event, "properties");
  const permissionSession = readString(properties, "sessionID");
  if (sessionId && permissionSession !== sessionId) return null;
  const targetSession = permissionSession || sessionId;
  const permissionId = readString(properties, "id");
  return targetSession && permissionId ? { sessionId: targetSession, permissionId } : null;
}

/** Joins the `data:` lines of one SSE block ("" when none). */
export function extractSseData(block: string): string {
  return block
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.replace(/^data:\s?/, ""))
    .join("\n");
}
