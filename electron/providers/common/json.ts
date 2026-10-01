/**
 * Small, dependency-free guards for JSON parsed from CLI stdout, HTTP bodies
 * and WebSocket frames. Pure — safe to import from tests.
 */

export type JsonRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asRecord(value: unknown): JsonRecord | null {
  return isRecord(value) ? value : null;
}

/** `value[key]` when it is a string, else undefined. */
export function readString(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) return undefined;
  const field = value[key];
  return typeof field === "string" ? field : undefined;
}

/** `value[key]` when it is a non-empty (trimmed) string, else undefined. */
export function readNonEmptyString(value: unknown, key: string): string | undefined {
  const field = readString(value, key);
  const trimmed = field?.trim();
  return trimmed ? trimmed : undefined;
}

export function readNumber(value: unknown, key: string): number | undefined {
  if (!isRecord(value)) return undefined;
  const field = value[key];
  return typeof field === "number" && Number.isFinite(field) ? field : undefined;
}

export function readRecord(value: unknown, key: string): JsonRecord | undefined {
  if (!isRecord(value)) return undefined;
  const field = value[key];
  return isRecord(field) ? field : undefined;
}

/** Parses JSON without throwing; `undefined` means "not JSON". */
export function safeJsonParse(text: string): unknown {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch {
    return undefined;
  }
}

/** `err.message` for Errors, `String(err)` otherwise. */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (isRecord(err) && typeof err.message === "string") return err.message;
  return String(err);
}

/** Trimmed string or "" for anything else. */
export function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
