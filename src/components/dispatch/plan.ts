/**
 * Pure logic behind the Dispatch card: planner model choice, row creation
 * from planner output, branch naming, validation, and the payload handed
 * to App's `onDispatch`.
 */

import type { Attachment, DispatchPlanRow, DispatchRowInput, DispatchRowResult } from "@shared/chat/types";
import type { GhIssue } from "@shared/github/types";
import {
  DEFAULT_MODEL_ID,
  MODELS,
  normalizeModelId,
  resolveEffort,
  type DispatchModelPayload,
  type EffortLevel,
  type ModelDefinition,
} from "@shared/models";
import type { Translator } from "./translator";

// TODO(shared-models): replace with PLANNER_PROVIDERS / isPlannerModel from
// @shared/models once that lands (mirrors electron/planner-capabilities in #230).
export const PLANNER_PROVIDERS: readonly string[] = ["claude", "codex", "opencode"];

export function isPlannerModel(model: Pick<ModelDefinition, "provider"> | null | undefined): boolean {
  return Boolean(model && PLANNER_PROVIDERS.includes(model.provider));
}

export type DispatchIssue = Pick<GhIssue, "number" | "title">;

/** One editable row in the Custom tab. */
export interface DispatchRow {
  key: string;
  prompt: string;
  branch: string;
  /** "" = inherit the card's default model (and its effort). */
  model: string;
  /** Effort for an explicit `model`; ignored while inheriting. */
  effort: EffortLevel | null;
  attachments: Attachment[];
  issue?: DispatchIssue;
  cwd?: string;
}

export type DispatchRowPatch = Partial<Omit<DispatchRow, "key">>;
/** A patch, or a function computing one from the current row. */
export type DispatchRowUpdate = DispatchRowPatch | ((row: DispatchRow) => DispatchRowPatch);

/** Apply `update` to the row with `key`; other rows keep their identity. */
export function updateRow(rows: readonly DispatchRow[], key: string, update: DispatchRowUpdate): DispatchRow[] {
  return rows.map((row) => {
    if (row.key !== key) return row;
    const patch = typeof update === "function" ? update(row) : update;
    return { ...row, ...patch };
  });
}

export interface DispatchDropdownOption {
  value: string;
  label: string;
  triggerLabel?: string;
  sublabel?: string;
  group?: string;
}

const BRANCH_MAX = 48;

/**
 * Default planner: `preferred` when it is a planner model (legacy ids
 * normalize, e.g. `gpt55-med` → `gpt-5.5`), else the app default model,
 * else the first planner model.
 */
export function defaultPlannerModelId(models: readonly ModelDefinition[], preferred: string | null | undefined): string {
  const planners = models.filter(isPlannerModel);
  const normalized = normalizeModelId(preferred);
  return planners.find((m) => m.id === normalized)?.id
    ?? planners.find((m) => m.id === DEFAULT_MODEL_ID)?.id
    ?? planners[0]?.id
    ?? "";
}

/** The planner actually used: the selection if still available, else the default. */
export function resolvePlannerModelId(
  models: readonly ModelDefinition[],
  selected: string | null | undefined,
  preferred: string | null | undefined,
): string {
  const normalized = normalizeModelId(selected);
  if (models.some((m) => isPlannerModel(m) && m.id === normalized)) return normalized ?? "";
  return defaultPlannerModelId(models, preferred);
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** `dispatch-YYYYMMDD-HHMM-<n>` in local time. */
export function defaultCustomBranch(index: number, now: Date = new Date()): string {
  const date = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`;
  const time = `${pad2(now.getHours())}${pad2(now.getMinutes())}`;
  return `dispatch-${date}-${time}-${index + 1}`;
}

export function makeRowKey(): string {
  return "r" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
}

export function makeCustomRow(index: number, now: Date = new Date()): DispatchRow {
  return { key: makeRowKey(), prompt: "", branch: defaultCustomBranch(index, now), model: "", effort: null, attachments: [] };
}

/** kebab-case slug (≤48 chars) or the default branch name. */
export function sanitizeBranchName(text: string | null | undefined, fallbackIndex: number, now: Date = new Date()): string {
  const slug = (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "")
    .slice(0, BRANCH_MAX);
  return slug || defaultCustomBranch(fallbackIndex, now);
}

/** `base`, or `base-2`, `base-3`… (kept ≤48 chars); records the result in `used`. */
export function uniqueBranchName(base: string, used: Set<string>): string {
  let next = base;
  let i = 2;
  while (used.has(next)) {
    const suffix = `-${i}`;
    next = `${base.slice(0, Math.max(1, BRANCH_MAX - suffix.length))}${suffix}`;
    i += 1;
  }
  used.add(next);
  return next;
}

/** Rows from planner output; unknown models inherit, empty prompts are dropped. */
export function rowsFromPlan(
  planRows: readonly Partial<DispatchPlanRow>[],
  validModelIds: ReadonlySet<string>,
  now: Date = new Date(),
): DispatchRow[] {
  const usedBranches = new Set<string>();
  return planRows
    .map((plan, index): DispatchRow => ({
      key: makeRowKey(),
      prompt: String(plan.prompt || plan.title || "").trim(),
      branch: uniqueBranchName(sanitizeBranchName(plan.branch || plan.title || plan.prompt, index, now), usedBranches),
      model: plan.model && validModelIds.has(plan.model) ? plan.model : "",
      effort: null,
      attachments: [],
    }))
    .filter((row) => row.prompt.trim());
}

function readString(model: ModelDefinition, key: "providerId" | "modelId" | "apiKey" | "baseURL"): string {
  const value: unknown = (model as Partial<Record<typeof key, unknown>>)[key];
  return typeof value === "string" ? value : "";
}

/**
 * Model description sent to `dispatch-plan`. `effort` overrides the model's
 * own (legacy-encoded) effort and is clamped to what the model accepts.
 */
export function buildModelPayload(
  model: ModelDefinition,
  options: { includeRuntimeConfig?: boolean; effort?: EffortLevel | null } = {},
): DispatchModelPayload {
  const effort = options.effort ? resolveEffort(model, options.effort) ?? undefined : model.effort;
  const payload: DispatchModelPayload = {
    id: model.id,
    name: model.name || model.id,
    tag: model.tag,
    provider: model.provider,
    cliFlag: model.cliFlag,
    effort,
    thinking: model.thinking,
  };
  if (options.includeRuntimeConfig && model.provider === "opencode") {
    payload.openCodeConfig = {
      providerId: readString(model, "providerId"),
      modelId: readString(model, "modelId"),
      apiKey: readString(model, "apiKey"),
      baseURL: readString(model, "baseURL"),
    };
  }
  return payload;
}

/** `error.message` for Error-like values, the string itself, else "". */
export function errorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return "";
}

export function cleanDispatchPlanError(error: unknown, fallback: string): string {
  const raw = errorMessage(error) || fallback;
  return raw.replace(/^Error invoking remote method 'dispatch-plan':\s*/i, "") || fallback;
}

/** Row key → message for empty prompts / branches and duplicate branches. */
export function validateRows(rows: readonly DispatchRow[], t: Translator): Record<string, string> {
  const errors: Record<string, string> = {};
  const seen = new Set<string>();
  for (const row of rows) {
    const branch = row.branch.trim();
    if (!row.prompt.trim()) errors[row.key] = t("dispatch.errorPromptEmpty");
    else if (!branch) errors[row.key] = t("dispatch.errorBranchEmpty");
    else if (seen.has(branch)) errors[row.key] = t("dispatch.errorBranchDuplicate");
    else seen.add(branch);
  }
  return errors;
}

/** Rows → `onDispatch` payload. Inheriting rows take the default model and effort. */
export function buildDispatchPayload(
  rows: readonly DispatchRow[],
  defaults: { model: string; effort: EffortLevel | null; cwd: string },
): DispatchRowInput[] {
  return rows.map((row) => {
    const inherits = !row.model;
    return {
      prompt: row.prompt.trim(),
      attachments: row.attachments,
      model: inherits ? defaults.model : row.model,
      effort: inherits ? defaults.effort : row.effort,
      cwd: row.cwd || defaults.cwd,
      branch: row.branch.trim(),
      issueContext: row.issue ? `Issue #${row.issue.number}: ${row.issue.title}` : undefined,
      tag: row.issue ? `#${row.issue.number}` : undefined,
    };
  });
}

export interface DispatchOutcome {
  /** Row key → failure message. */
  errors: Record<string, string>;
  succeeded: number;
  failed: number;
  /** Trimmed branch names that dispatched successfully. */
  successBranches: Set<string>;
}

/** Map results back to rows (by branch, since results carry the payload row). */
export function summarizeDispatch(
  rows: readonly DispatchRow[],
  results: readonly DispatchRowResult[],
  fallbackError: string,
): DispatchOutcome {
  const keyByBranch = new Map(rows.map((row) => [row.branch.trim(), row.key] as const));
  const errors: Record<string, string> = {};
  const successBranches = new Set<string>();
  let failed = 0;
  for (const result of results) {
    if (result.ok) {
      successBranches.add(result.row.branch);
      continue;
    }
    failed += 1;
    const key = keyByBranch.get(result.row.branch);
    if (key) errors[key] = errorMessage(result.error) || fallbackError;
  }
  return { errors, succeeded: results.length - failed, failed, successBranches };
}

/** Options for a row's issue dropdown (placeholder rows while loading / on error). */
export function issueOptions(
  issues: readonly DispatchIssue[],
  loading: boolean,
  error: string | null,
  t: Translator,
): DispatchDropdownOption[] {
  const group = t("dispatch.issueGroup");
  const none: DispatchDropdownOption = {
    value: "",
    label: t("dispatch.noIssue"),
    triggerLabel: t("dispatch.noIssueShort"),
    group,
  };
  if (loading) return [none, { value: "__loading", label: t("dispatch.loadingIssues"), triggerLabel: "...", group }];
  if (error) return [none, { value: "__error", label: error, triggerLabel: t("dispatch.noIssueShort"), group }];
  return [
    none,
    ...issues.map((issue) => ({
      value: String(issue.number),
      label: `#${issue.number} ${issue.title}`,
      triggerLabel: `#${issue.number}`,
      sublabel: "ISSUE",
      group,
    })),
  ];
}

/** Options grouped by `group`, preserving first-seen group order. */
export function groupOptions(options: readonly DispatchDropdownOption[], grouped: boolean): [string, DispatchDropdownOption[]][] {
  if (!grouped) return [["", [...options]]];
  const groups = new Map<string, DispatchDropdownOption[]>();
  for (const option of options) {
    const group = option.group || "";
    const list = groups.get(group);
    if (list) list.push(option);
    else groups.set(group, [option]);
  }
  return [...groups.entries()];
}

/**
 * The non-built-in entries of an available-model list (what ModelPicker
 * takes as `extraModels`; it adds the built-in catalogue itself).
 */
export function dynamicModelsOf(models: readonly ModelDefinition[]): ModelDefinition[] {
  const builtinIds = new Set<string>(MODELS.map((m) => m.id));
  return models.filter((m) => !builtinIds.has(m.id));
}
