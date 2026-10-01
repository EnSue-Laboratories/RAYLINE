/** Pure ChatArea helpers: transcript windowing math and header / hint derivations. */
import type { GitStatus } from "@shared/git/types";
import type { MessageKey } from "../../i18n";

// ── Transcript window (PERF #6) ─────────────────────────────────────────────

/** Messages mounted when a conversation opens. */
export const WINDOW_SIZE = 40;
/** Messages prepended each time the top sentinel comes into view. */
export const WINDOW_STEP = 40;

/**
 * First mounted message index. `anchor` is the stored start (null until the
 * conversation has messages). Appended messages never move it (so content
 * above the reader never unmounts); it resets when the list shrinks past it
 * (rewind, /clear, /compact).
 */
export function resolveWindowStart(anchor: number | null, total: number, size: number = WINDOW_SIZE): number | null {
  if (total <= 0) return null;
  if (anchor === null || anchor >= total) return Math.max(0, total - size);
  return Math.max(0, anchor);
}

export function expandWindowStart(anchor: number | null, step: number = WINDOW_STEP): number {
  return Math.max(0, (anchor ?? 0) - step);
}

/** Keep the same content under the viewport after content was inserted above it. */
export function scrollTopAfterPrepend(previousScrollTop: number, previousScrollHeight: number, nextScrollHeight: number): number {
  return previousScrollTop + Math.max(0, nextScrollHeight - previousScrollHeight);
}

// ── Header / composer derivations ───────────────────────────────────────────

function mainRepoRoot(dir: string): string {
  const index = dir.indexOf("/.worktrees/");
  return index !== -1 ? dir.slice(0, index) : dir;
}

/** Conversations in the drafts area (no cwd, or under the drafts path) hide git controls. */
export function isDraftContext(cwd: string | null | undefined, draftsPath: string | null | undefined): boolean {
  if (cwd == null) return true;
  if (!draftsPath) return false;
  return mainRepoRoot(cwd) === mainRepoRoot(draftsPath);
}

export interface BranchAttention {
  needsAttention: boolean;
  hintKey: MessageKey;
}

/** Multica runs on the pushed branch: warn when the worktree is dirty or unpublished. */
export function branchAttention(status: GitStatus | null | undefined): BranchAttention {
  const dirty = (status?.files.length ?? 0) > 0;
  const noUpstream = Boolean(status?.branch) && !status?.upstream && !status?.detached;
  const hintKey: MessageKey = dirty && noUpstream ? "chatArea.branchWarnBoth" : dirty ? "chatArea.branchWarnDirty" : "chatArea.branchWarnNoUpstream";
  return { needsAttention: dirty || noUpstream, hintKey };
}

/** "repo / worktree" for paths inside `.worktrees`, else the last two segments. */
export function shellLocationLabel(cwd: string | null | undefined): string {
  if (!cwd) return "current workspace";
  const parts = cwd.split("/");
  const worktreeIndex = parts.indexOf(".worktrees");
  if (worktreeIndex >= 0 && worktreeIndex + 1 < parts.length) return `${parts[worktreeIndex - 1] ?? ""} / ${parts[worktreeIndex + 1] ?? ""}`;
  return parts.slice(-2).join("/") || parts[parts.length - 1] || cwd;
}
