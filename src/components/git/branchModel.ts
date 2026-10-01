/** Pure branch / worktree list logic for BranchSelector. */
import type { GitWorktree } from "@shared/git/types";

export type BranchMenuMode = "branch" | "worktree";

export const PROTECTED_BRANCHES: readonly string[] = ["main", "master"];

/** Pending delete confirmation in the branch menu. */
export type DeleteTarget =
  | { type: "branch"; name: string }
  | { type: "worktree"; path: string; branch: string | null };

/** Pending "promote worktree to main checkout" confirmation. */
export interface PromoteTarget {
  path: string;
  branch: string | null;
}

/** The current branch and main/master can't be deleted from the menu. */
export function isBranchDeletable(branch: string, current: string | null): boolean {
  return branch !== current && !PROTECTED_BRANCHES.includes(branch);
}

export function normalizeBranchQuery(query: string): string {
  return query.trim().toLowerCase();
}

export function filterBranches(branches: readonly string[], query: string): readonly string[] {
  const q = normalizeBranchQuery(query);
  return q ? branches.filter((branch) => branch.toLowerCase().includes(q)) : branches;
}

export function getWorktreeName(path: string): string {
  return path.split("/").pop() || "";
}

/** The first non-bare worktree is the main checkout. */
export function findMainWorktree(worktrees: readonly GitWorktree[]): GitWorktree | null {
  return worktrees.find((w) => !w.bare) ?? null;
}

/** Linked worktrees (everything except bare repos and the main checkout). */
export function listLinkedWorktrees(worktrees: readonly GitWorktree[], main: GitWorktree | null): GitWorktree[] {
  return worktrees.filter((w) => !w.bare && w.path !== main?.path);
}

/** Matches the folder name, full path, or branch. */
export function filterWorktrees(worktrees: readonly GitWorktree[], query: string): readonly GitWorktree[] {
  const q = normalizeBranchQuery(query);
  if (!q) return worktrees;
  return worktrees.filter(
    (wt) =>
      getWorktreeName(wt.path).toLowerCase().includes(q) ||
      wt.path.toLowerCase().includes(q) ||
      (wt.branch || "").toLowerCase().includes(q),
  );
}

/** New worktrees live in `<repo>/.worktrees/<name>`. */
export function buildWorktreePath(cwd: string, name: string): string {
  return `${cwd.replace(/\/$/, "")}/.worktrees/${name}`;
}

export function errorMessage(error: unknown, fallback = ""): string {
  if (error instanceof Error) return error.message || fallback;
  if (typeof error === "string") return error || fallback;
  return fallback;
}
