/**
 * Pure state transitions for AskUserQuestionBlock. Selections and custom
 * text are keyed by question key (`question.id` or `question-<index>`).
 */

import { isAskUserQuestionItem, type AskUserQuestionItem, type ToolPart } from "@shared/chat/types";

export type SelectionMap = Readonly<Record<string, readonly string[]>>;
export type CustomTextMap = Readonly<Record<string, string>>;

/** Questions from a tool part's args; tolerant of non-AskUserQuestion names. */
export function readQuestions(args: ToolPart["args"] | null | undefined): AskUserQuestionItem[] {
  const questions = args?.questions;
  return Array.isArray(questions) ? questions.filter(isAskUserQuestionItem) : [];
}

export function getQuestionKey(question: AskUserQuestionItem | undefined, index: number): string {
  const id: unknown = question ? (question as AskUserQuestionItem & { id?: unknown }).id : undefined;
  return typeof id === "string" && id ? id : `question-${index}`;
}

export function omitKey<T>(record: Readonly<Record<string, T>>, key: string): Readonly<Record<string, T>> {
  if (!(key in record)) return record;
  const next = { ...record };
  delete next[key];
  return next;
}

/** Radio semantics for single-select, toggle semantics for multi-select. */
export function selectOption(
  selections: SelectionMap,
  key: string,
  label: string,
  multiSelect: boolean,
): SelectionMap {
  if (!multiSelect) return { ...selections, [key]: [label] };
  const current = selections[key] ?? [];
  const next = current.includes(label) ? current.filter((l) => l !== label) : [...current, label];
  return { ...selections, [key]: next };
}

/** Typing a custom answer stores it (or clears it when emptied). */
export function setCustomText(custom: CustomTextMap, key: string, value: string): CustomTextMap {
  if (value) return { ...custom, [key]: value };
  return omitKey(custom, key);
}

export function hasAnyAnswer(selections: SelectionMap, custom: CustomTextMap): boolean {
  return Object.values(custom).some((text) => text.trim().length > 0)
    || Object.values(selections).some((labels) => labels.length > 0);
}

/**
 * One line per answered question: the custom text if present, otherwise the
 * selected labels joined with ", ". Unanswered questions are skipped.
 */
export function buildAnswerText(
  questions: readonly AskUserQuestionItem[],
  selections: SelectionMap,
  custom: CustomTextMap,
): string {
  const lines: string[] = [];
  questions.forEach((question, index) => {
    const key = getQuestionKey(question, index);
    const customText = custom[key]?.trim();
    if (customText) {
      lines.push(customText);
      return;
    }
    const selected = selections[key] ?? [];
    if (selected.length > 0) lines.push(selected.join(", "));
  });
  return lines.join("\n");
}
