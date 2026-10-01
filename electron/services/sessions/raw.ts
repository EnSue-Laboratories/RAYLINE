/**
 * Narrowing helpers for the untyped JSONL events written by the Claude and
 * Codex CLIs. Every event is parsed as `unknown` and read through these.
 */

export type RawRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is RawRecord {
  return typeof value === "object" && value !== null;
}

export function asRecord(value: unknown): RawRecord | null {
  return isRecord(value) ? value : null;
}

/** `obj?.[key]` narrowed to a record. */
export function getRecord(obj: RawRecord | null | undefined, key: string): RawRecord | null {
  return obj ? asRecord(obj[key]) : null;
}

export function getString(obj: RawRecord | null | undefined, key: string): string | undefined {
  const value = obj?.[key];
  return typeof value === "string" ? value : undefined;
}

export function getArray(obj: RawRecord | null | undefined, key: string): unknown[] | undefined {
  const value = obj?.[key];
  return Array.isArray(value) ? (value as unknown[]) : undefined;
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** JSON.parse that never throws; undefined on malformed input. */
export function parseJsonLine(line: string): unknown {
  if (!line.trim()) return undefined;
  try {
    return JSON.parse(line) as unknown;
  } catch {
    return undefined;
  }
}

/** Collision-resistant-enough local id, matching the legacy reader. */
export function localId(prefix: string): string {
  return `${prefix}${Date.now()}${Math.random()}`;
}

export const SYSTEM_REMINDER_RE = /<system-reminder>[\s\S]*?<\/system-reminder>/g;
export const SKILL_PREAMBLE = "Base directory for this skill:";
