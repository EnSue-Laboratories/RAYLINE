/**
 * Reassembles the final assistant text from `opencode run --format json`
 * events, skipping reasoning parts (pure).
 */

type JsonRecord = Record<string, unknown>;

export interface OpenCodeTextState {
  chunks: string[];
  partTextById: Map<string, string>;
  partTypes: Map<string, string>;
}

export function createOpenCodeTextState(): OpenCodeTextState {
  return { chunks: [], partTextById: new Map(), partTypes: new Map() };
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null;
}

function rec(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value) return value;
  }
  return "";
}

/** Error text carried by an `error` / `session.error` event, or "". */
export function extractOpenCodePlannerError(event: unknown): string {
  if (!isRecord(event)) return "";
  if (event.type === "error") {
    const error = event.error;
    return firstText(event.message, rec(error).message, error).trim();
  }
  if (event.type === "session.error") {
    const properties = rec(event.properties);
    const error = properties.error;
    return firstText(rec(error).message, error, properties.message).trim();
  }
  return "";
}

function isReasoningEvent(event: JsonRecord): boolean {
  const type = firstText(event.type, rec(event.part).type, rec(rec(event.properties).part).type).toLowerCase();
  return type === "reasoning" || type === "thinking" || type.includes("reasoning");
}

function addText(state: OpenCodeTextState, id: unknown, text: string): void {
  if (typeof id === "string" && id) state.partTextById.set(id, text);
  else state.chunks.push(text);
}

export function collectOpenCodePlannerText(event: unknown, state: OpenCodeTextState): void {
  if (!isRecord(event)) return;
  if (event.type === "error" || event.type === "session.error") return;
  const properties = rec(event.properties);
  const part = rec(event.part ?? properties.part);
  if (typeof part.id === "string" && part.id && typeof part.type === "string" && part.type) {
    state.partTypes.set(part.id, part.type);
  }
  if (isReasoningEvent(event)) return;

  const message = rec(event.message);
  const parts: unknown[] = Array.isArray(event.parts)
    ? (event.parts as unknown[])
    : Array.isArray(message.parts) ? (message.parts as unknown[]) : [];
  for (const item of parts) {
    if (!isRecord(item) || item.type !== "text" || typeof item.text !== "string") continue;
    addText(state, item.id, item.text);
  }
  if (parts.length > 0) return;

  if (part.type === "reasoning" || part.type === "thinking") return;
  if (part.type === "text" && typeof part.text === "string") {
    addText(state, part.id, part.text);
    return;
  }

  if (event.type === "message.part.delta") {
    const partId = str(properties.partID);
    const delta = properties.delta;
    const partType = partId ? state.partTypes.get(partId) : str(properties.type);
    if (partType && partType !== "text") return;
    if (partId && typeof delta === "string") {
      state.partTextById.set(partId, `${state.partTextById.get(partId) ?? ""}${delta}`);
    }
    return;
  }

  const isAssistantText = event.type === "text" || event.role === "assistant" || message.role === "assistant";
  if (!isAssistantText) return;
  const directText = firstText(event.text, event.delta, event.content, event.message);
  if (directText) state.chunks.push(directText);
}

export function openCodeTextResult(state: OpenCodeTextState): string {
  const fromParts = [...state.partTextById.values()].join("");
  return (fromParts || state.chunks.join("")).trim();
}
