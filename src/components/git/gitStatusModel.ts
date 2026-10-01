/** Pure git-status summarizing for GitStatusPill. */
import type { GitOpenPr, GitStatus, GitStatusCode, GitStatusFile } from "@shared/git/types";
import type { Translator } from "../sidebar/types";

export type StatusLetter = "U" | "A" | "D" | "R" | "M";

/** Porcelain code → the letter shown in the file list (`?` untracked → U). */
export function letterFor(code: GitStatusCode): StatusLetter {
  switch (code) {
    case "?":
      return "U";
    case "A":
    case "D":
    case "R":
      return code;
    default:
      return "M";
  }
}

export const STATUS_COLORS: Readonly<Record<StatusLetter, string>> = {
  U: "var(--badge-open-text)",
  A: "var(--badge-open-text)",
  M: "var(--state-warning-text)",
  D: "var(--danger-soft-text)",
  R: "var(--badge-open-text)",
};

export type FileListKind = "staged" | "unstaged";

/** The code that describes a file within the given list. */
export function fileCodeFor(file: GitStatusFile, kind: FileListKind): GitStatusCode {
  switch (kind) {
    case "staged":
      return file.index;
    case "unstaged":
      return file.index === "?" ? "?" : file.worktree;
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

export function isUntracked(file: GitStatusFile): boolean {
  return file.index === "?";
}

/** A file can appear in both lists (partially staged). Untracked files are unstaged. */
export function splitStatusFiles(files: readonly GitStatusFile[]): {
  staged: GitStatusFile[];
  unstaged: GitStatusFile[];
} {
  return {
    staged: files.filter((f) => f.index !== "." && f.index !== "?"),
    unstaged: files.filter((f) => f.worktree !== "." || f.index === "?"),
  };
}

export interface PrInfo {
  loading: boolean;
  /** A `git-pr-status` lookup completed for this cwd. */
  checked: boolean;
  /** gh unavailable / lookup failed: don't block on PR state. */
  unavailable: boolean;
  openPr: GitOpenPr | null;
}

export const EMPTY_PR_INFO: PrInfo = { loading: false, checked: false, unavailable: false, openPr: null };
export const UNAVAILABLE_PR_INFO: PrInfo = { loading: false, checked: false, unavailable: true, openPr: null };

export interface GitPillState {
  dirty: number;
  ahead: number;
  behind: number;
  branch: string | null;
  upstream: string | null;
  detached: boolean;
  clean: boolean;
  staged: GitStatusFile[];
  unstaged: GitStatusFile[];
  canPush: boolean;
  canPull: boolean;
  canCommit: boolean;
  /** Target branch for "create PR" (`defaultPrBranch`, default main). */
  prBase: string;
  /** Open upstream PR for the current branch. */
  openPr: GitOpenPr | null;
  isCheckingPr: boolean;
  canPr: boolean;
  canPublish: boolean;
}

export interface GitPillInputs {
  message: string;
  busy: boolean;
  defaultPrBranch: string | null | undefined;
  prInfo: PrInfo;
}

export function deriveGitPillState(status: GitStatus, { message, busy, defaultPrBranch, prInfo }: GitPillInputs): GitPillState {
  const { ahead, behind, detached, upstream, branch } = status;
  const dirty = status.files.length;
  const { staged, unstaged } = splitStatusFiles(status.files);
  const prBase = (defaultPrBranch || "main").trim();
  const openPr = prInfo.openPr && prInfo.openPr.headRefName === branch ? prInfo.openPr : null;
  const isCheckingPr = !prInfo.unavailable && prInfo.loading && !prInfo.checked;
  const hasUpstream = Boolean(upstream);
  return {
    dirty,
    ahead,
    behind,
    branch,
    upstream,
    detached,
    clean: dirty === 0 && ahead === 0 && behind === 0,
    staged,
    unstaged,
    canPush: !detached && hasUpstream,
    canPull: !detached && hasUpstream && behind > 0,
    canCommit: !detached && dirty > 0 && message.trim().length > 0 && !busy,
    prBase,
    openPr,
    isCheckingPr,
    canPr: !detached && Boolean(branch) && branch !== prBase && !busy && hasUpstream && !isCheckingPr && !openPr,
    canPublish: !detached && Boolean(branch) && !hasUpstream && !busy,
  };
}

/** Tooltip of the PR button. */
export function getPrButtonTitle(
  state: GitPillState,
  { prSuccess, isCreatingPr }: { prSuccess: string; isCreatingPr: boolean },
  t: Translator,
): string {
  if (prSuccess) return prSuccess;
  if (isCreatingPr) return t("git.status.creatingPr");
  if (state.isCheckingPr) return t("git.status.checkingPrTitle");
  if (state.canPr) return t("git.status.createPrTitle", { base: state.prBase });
  if (state.branch === state.prBase) return t("git.status.onBaseBranch", { base: state.prBase });
  if (state.openPr) return t("git.status.upstreamPrExists", { number: state.openPr.number });
  return t("git.status.cannotCreatePr");
}

/** Tooltip of the header pill. */
export function getPillTooltip(state: GitPillState, t: Translator): string {
  if (state.detached) return t("git.status.detachedTooltip");
  if (!state.upstream) return t("git.status.noUpstream");
  if (state.clean) return t("git.status.cleanInSync");
  return t("git.status.statusSummary", { dirty: state.dirty, ahead: state.ahead, behind: state.behind });
}

/** What the pill itself shows. */
export type PillBadge =
  | { kind: "detached" }
  | { kind: "local" }
  | { kind: "clean" }
  /** `up`: dirty files, else commits ahead (null = hide); `down`: commits behind (null = hide). */
  | { kind: "changes"; up: number | null; down: number | null };

export function getPillBadge(state: GitPillState): PillBadge {
  if (state.detached) return { kind: "detached" };
  if (!state.upstream) return { kind: "local" };
  if (state.clean) return { kind: "clean" };
  return {
    kind: "changes",
    up: state.dirty > 0 ? state.dirty : state.ahead > 0 ? state.ahead : null,
    down: state.behind > 0 ? state.behind : null,
  };
}
