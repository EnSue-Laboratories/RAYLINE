/**
 * Local git operations exposed over IPC (`git-*` channels in electron/main).
 * Most mutating handlers never throw: they resolve to a `GitOpResult`
 * (`{ ok: false, stderr }` on failure). The exceptions — `git-create-branch`,
 * `git-checkout`, `git-worktree-add`, `git-delete-branch`,
 * `git-worktree-remove` — reject with the git error message.
 */

/** `{ ok: true, ...T } | { ok: false, stderr }` — common handler result. */
export type GitOpResult<T extends object = Record<never, never>> =
  | ({ ok: true } & T)
  | { ok: false; stderr: string };

/** `git-branches` */
export interface GitBranchList {
  current: string | null;
  branches: string[];
}

/** Handlers that reject on failure resolve to this. */
export interface GitSuccess {
  success: true;
}

/** `git-worktree-list` entry (`git worktree list --porcelain`). */
export interface GitWorktree {
  path: string;
  /** Commit sha. */
  head?: string;
  /** Short branch name (refs/heads/ stripped); absent when detached. */
  branch?: string;
  bare?: true;
}

export interface GitWorktreeAddOptions {
  /** Default true: `git worktree add -b <branch> [startPoint]`. */
  createBranch?: boolean;
  startPoint?: string;
}

/** `git-worktree-add` */
export interface GitWorktreeAddResult {
  success: true;
  path: string;
}

export type GitWorktreePromoteErrorCode = "DIRTY" | "BUSY" | "WORKTREE_DIRTY";

/** `git-worktree-promote` */
export type GitWorktreePromoteResult =
  | { success: true; cleanupPending?: true }
  | { success: false; error: string; code?: GitWorktreePromoteErrorCode };

/**
 * Porcelain v2 XY status letter: `.` unmodified, `M` modified, `A` added,
 * `D` deleted, `R` renamed, `C` copied, `U` unmerged, `?` untracked, `T` type change.
 */
export type GitStatusCode = "." | "M" | "A" | "D" | "R" | "C" | "U" | "?" | "T" | (string & {});

export interface GitStatusFile {
  path: string;
  /** Staged (X) status. */
  index: GitStatusCode;
  /** Unstaged (Y) status. */
  worktree: GitStatusCode;
}

/** `git-status` (null when cwd is missing or not a repo). */
export interface GitStatus {
  branch: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  files: GitStatusFile[];
  detached: boolean;
}

/** `git-diff` — `git diff HEAD`, truncated at 64 KiB. */
export interface GitDiff {
  diff: string;
  truncated: boolean;
}

/** Output-carrying git results (`git-commit`, `git-push`, `git-pull`). */
export interface GitStdout {
  stdout: string;
}

/** `git-ignore` */
export interface GitIgnoreOk {
  alreadyIgnored?: true;
}

/** Open upstream PR for the current branch (normalized GitHub REST pull). */
export interface GitOpenPr {
  number: number;
  title: string;
  url: string | null;
  /** Uppercased GitHub state, e.g. "OPEN". */
  state: string;
  headRefName: string | null;
  baseRefName: string | null;
  isDraft: boolean;
}

/** `git-pr-status` success payload. `branch` is null on detached HEAD. */
export interface GitPrStatus {
  branch: string | null;
  openPr: GitOpenPr | null;
}

/** `git-create-pr` success payload. */
export interface GitCreatePrOk {
  action: "created";
  number: number | null;
  url: string | null;
  stdout: string;
}

/** `git-merge-pr` success payload. */
export interface GitMergePrOk {
  number: number;
  url: string | null;
  stdout: string;
}

/** `git-gen-commit-message` success payload. */
export interface GitCommitMessageOk {
  message: string;
}

/** `project-clone` argument. */
export interface CloneRepoRequest {
  /** https/ssh URL or `owner/repo`. */
  url: string;
  parentDir: string;
}

/** `project-clone` result. */
export type CloneRepoResult = { ok: true; path: string } | { ok: false; stderr: string };
