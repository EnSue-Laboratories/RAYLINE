/**
 * Extracts the dispatch plan JSON from planner output that may contain
 * fences, reasoning blocks or prose around it (pure).
 */

import type { DispatchPlan, DispatchPlanRow } from "@shared/chat/types";
import { stripPlannerReasoningBlocks } from "./prompt";

const MAX_ROWS = 8;

/** Index just past the JSON object/array starting at `start`, or -1 if unbalanced. */
export function findJsonValueEnd(text: string, start: number): number {
  const opening = text.charAt(start);
  const expectedClose = opening === "{" ? "}" : opening === "[" ? "]" : "";
  if (!expectedClose) return -1;

  const stack = [expectedClose];
  let inString = false;
  let escaped = false;

  for (let i = start + 1; i < text.length; i += 1) {
    const ch = text.charAt(i);
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === "\"") inString = false;
      continue;
    }
    if (ch === "\"") {
      inString = true;
    } else if (ch === "{" || ch === "[") {
      stack.push(ch === "{" ? "}" : "]");
    } else if (ch === "}" || ch === "]") {
      if (stack.pop() !== ch) return -1;
      if (stack.length === 0) return i + 1;
    }
  }
  return -1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function field(row: unknown, key: keyof DispatchPlanRow): string {
  if (!isRecord(row)) return "";
  const value = row[key];
  if (value === null || value === undefined || value === false || value === "" || value === 0) return "";
  return (typeof value === "string" ? value : JSON.stringify(value)).trim();
}

/** `{ rows: [...] }` or a bare array → normalized plan; null for any other shape. */
export function normalizeDispatchPlanPayload(parsed: unknown): DispatchPlan | null {
  const rows: unknown = Array.isArray(parsed) ? parsed : isRecord(parsed) ? parsed.rows : undefined;
  if (!Array.isArray(rows)) return null;
  const normalizedRows = (rows as unknown[]).slice(0, MAX_ROWS).map((row) => ({
    title: field(row, "title"),
    prompt: field(row, "prompt"),
    branch: field(row, "branch"),
    model: field(row, "model"),
  })).filter((row) => row.prompt || row.title);
  return { rows: normalizedRows };
}

function parseCandidate(jsonText: string): DispatchPlan | null {
  try {
    return normalizeDispatchPlanPayload(JSON.parse(jsonText));
  } catch {
    return null;
  }
}

export function findDispatchPlanInText(text: string): { plan: DispatchPlan | null; sawRowsPayload: boolean } {
  const sources: string[] = [];
  for (const match of text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    const body = match[1]?.trim();
    if (body) sources.push(body);
  }
  const stripped = stripPlannerReasoningBlocks(text);
  if (stripped && stripped !== text) sources.push(stripped);
  sources.push(text);

  let sawRowsPayload = false;
  for (const source of sources) {
    for (let i = 0; i < source.length; i += 1) {
      const ch = source.charAt(i);
      if (ch !== "{" && ch !== "[") continue;
      const end = findJsonValueEnd(source, i);
      if (end <= i) continue;
      const plan = parseCandidate(source.slice(i, end));
      if (!plan) continue;
      sawRowsPayload = true;
      if (plan.rows.length > 0) return { plan, sawRowsPayload };
      i = end - 1;
    }
  }
  return { plan: null, sawRowsPayload };
}

/** Throws a user-facing Error when the output holds no usable rows. */
export function parseDispatchPlanJson(text: string): DispatchPlan {
  const raw = text.trim();
  if (!raw) throw new Error("Planner returned no output.");
  const { plan, sawRowsPayload } = findDispatchPlanInText(raw);
  if (!plan) {
    if (sawRowsPayload) throw new Error("Planner did not return any dispatch rows.");
    throw new Error("Planner returned output that did not contain the required JSON rows.");
  }
  if (plan.rows.length === 0) throw new Error("Planner did not return any dispatch rows.");
  return plan;
}
