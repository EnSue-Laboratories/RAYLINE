/**
 * Minimal runtime validation of GitHub REST payloads coming from `gh api`.
 * Only the fields RayLine relies on are checked; objects pass through as-is.
 */

import type {
  GhBranch,
  GhComment,
  GhIssue,
  GhMergeResult,
  GhPullRequest,
  GhRepoSummary,
  GhUser,
} from "@shared/github/types";

type Rec = Record<string, unknown>;

export function isRecord(value: unknown): value is Rec {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const isNum = (v: unknown): v is number => typeof v === "number";
const isStr = (v: unknown): v is string => typeof v === "string";

export function isGhUser(value: unknown): value is GhUser {
  return isRecord(value) && isStr(value.login);
}

export function isGhIssue(value: unknown): value is GhIssue {
  return isRecord(value) && isNum(value.number) && isStr(value.title);
}

export function isGhPullRequest(value: unknown): value is GhPullRequest {
  return isRecord(value) && isNum(value.number) && isStr(value.title);
}

export function isGhComment(value: unknown): value is GhComment {
  return isRecord(value) && isNum(value.id);
}

export function isGhRepoSummary(value: unknown): value is GhRepoSummary {
  return isRecord(value) && isStr(value.nameWithOwner);
}

export function isGhBranch(value: unknown): value is GhBranch {
  return isRecord(value) && isStr(value.name);
}

export function isGhMergeResult(value: unknown): value is GhMergeResult {
  return isRecord(value) && (typeof value.merged === "boolean" || isStr(value.message));
}

/** Timeline `cross-referenced` event whose source is a pull request. */
export function crossReferencedPr(value: unknown): Rec | null {
  if (!isRecord(value) || value.event !== "cross-referenced") return null;
  const source = isRecord(value.source) ? value.source : null;
  const issue = source && isRecord(source.issue) ? source.issue : null;
  return issue && issue.pull_request && isNum(issue.number) ? issue : null;
}
