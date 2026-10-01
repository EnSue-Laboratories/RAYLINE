import type { GhComment, GhIssue, GhPullRequest } from "@shared/github/types";
import type { Translator } from "../../i18n";
import type { PmItemType } from "../types";

export type DetailItem = GhIssue | GhPullRequest;

export function isMergedPr(type: PmItemType, item: DetailItem): boolean {
  return type === "pr" && "merged_at" in item && Boolean(item.merged_at);
}

export interface StateBadge {
  label: string;
  bg: string;
  color: string;
}

export function getStateBadge(type: PmItemType, item: DetailItem, t: Translator): StateBadge {
  if (isMergedPr(type, item)) return { label: t("pm.mergedState"), bg: "var(--accent-bg)", color: "var(--accent-text)" };
  if (item.state === "closed") return { label: t("pm.closedState"), bg: "var(--accent-bg)", color: "var(--accent-text)" };
  return { label: t("pm.openState"), bg: "var(--success-bg)", color: "var(--success-text)" };
}

/** Comments are unchanged when ids and edit timestamps match in order. */
export function isSameCommentList(a: readonly GhComment[], b: readonly GhComment[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((comment, i) => {
    const other = b[i];
    return other !== undefined && comment.id === other.id && (comment.updated_at ?? comment.created_at) === (other.updated_at ?? other.created_at);
  });
}

/** GitHub bumps `updated_at` on every edit, label, assignee or state change. */
export function isSameItem(a: DetailItem, b: DetailItem): boolean {
  return a === b || (a.number === b.number && a.updated_at === b.updated_at && a.state === b.state);
}
