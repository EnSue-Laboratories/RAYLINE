/**
 * Collapse runs of consecutive tool calls (PERF #6): one assistant turn can
 * carry hundreds of tool parts; a collapsed group mounts none of them.
 */
import { ASK_USER_QUESTION_TOOL, type MessagePart } from "@shared/chat/types";
import { CODEX_NOTICE_KIND } from "../../store/chat/codexItems";

export const MIN_TOOL_GROUP_SIZE = 3;

/**
 * Parts kept in the message but not shown: Codex CLI housekeeping notices
 * ("loading hooks from both …", "skill descriptions were shortened …").
 * They stay in stored/exported transcripts.
 */
export function isHiddenPart(part: MessagePart): boolean {
  return part.type === "status" && part.kind === CODEX_NOTICE_KIND;
}

/** `parts` without hidden ones; the same array when nothing is hidden (memo-friendly). */
export function visibleParts(parts: readonly MessagePart[]): readonly MessagePart[] {
  return parts.some(isHiddenPart) ? parts.filter((part) => !isHiddenPart(part)) : parts;
}

export type PartItem =
  | { kind: "part"; index: number }
  /** Parts `start` … `end - 1`, all collapsible tool calls. */
  | { kind: "tools"; start: number; end: number };

function isGroupableTool(part: MessagePart | undefined): boolean {
  // AskUserQuestion is interactive and must stay visible.
  return part?.type === "tool" && part.name !== ASK_USER_QUESTION_TOOL;
}

/**
 * Render plan for `parts`. Runs of ≥ MIN_TOOL_GROUP_SIZE groupable tool parts
 * become one group. While `live` (message streaming), the trailing tool part
 * of a trailing run stays outside its group so progress remains visible.
 */
export function groupParts(parts: readonly MessagePart[], live: boolean): PartItem[] {
  const items: PartItem[] = [];
  let i = 0;
  while (i < parts.length) {
    if (!isGroupableTool(parts[i])) {
      items.push({ kind: "part", index: i });
      i += 1;
      continue;
    }
    let end = i;
    while (end < parts.length && isGroupableTool(parts[end])) end += 1;
    const groupEnd = live && end === parts.length ? end - 1 : end;
    if (groupEnd - i >= MIN_TOOL_GROUP_SIZE) {
      items.push({ kind: "tools", start: i, end: groupEnd });
      for (let k = groupEnd; k < end; k += 1) items.push({ kind: "part", index: k });
    } else {
      for (let k = i; k < end; k += 1) items.push({ kind: "part", index: k });
    }
    i = end;
  }
  return items;
}

/** Up to `limit` distinct tool names in order, for the group summary. */
export function summarizeToolNames(parts: readonly MessagePart[], limit = 3): { names: string[]; more: number } {
  const seen: string[] = [];
  for (const part of parts) {
    if (part.type === "tool" && !seen.includes(part.name)) seen.push(part.name);
  }
  return { names: seen.slice(0, limit), more: Math.max(0, seen.length - limit) };
}
