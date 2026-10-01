/**
 * GitHub data used by the Project Manager window (`gh-*` channels,
 * electron/github-manager). Issue / PR / comment objects are GitHub REST v3
 * payloads passed through from `gh api`; only the fields RayLine reads (plus a
 * few obvious neighbours) are declared — the real objects carry more.
 */

import type { PersistedWallpaper } from "../state/types";

export interface GhUser {
  login: string;
  id?: number;
  avatar_url?: string;
  html_url?: string;
  type?: string;
}

export interface GhLabel {
  name: string;
  /** Hex without '#'. */
  color: string;
  id?: number;
  description?: string | null;
}

export type GhIssueState = "open" | "closed";
/** Filter accepted by list endpoints. */
export type GhStateFilter = "open" | "closed" | "all";

/** GitHub REST issue (`/repos/{repo}/issues/{n}`). */
export interface GhIssue {
  id?: number;
  number: number;
  title: string;
  body: string | null;
  state: GhIssueState;
  html_url: string;
  user: GhUser | null;
  labels: GhLabel[];
  assignees: GhUser[];
  comments?: number;
  created_at: string;
  updated_at: string;
  closed_at?: string | null;
  /** Present when the "issue" is actually a PR (filtered out by listIssues). */
  pull_request?: { url?: string; html_url?: string; merged_at?: string | null };
}

export interface GhBranchRef {
  ref: string;
  sha: string;
  label?: string;
}

/** GitHub REST pull request (`/repos/{repo}/pulls/{n}`). */
export interface GhPullRequest {
  id?: number;
  number: number;
  title: string;
  body: string | null;
  state: GhIssueState;
  html_url: string;
  user: GhUser | null;
  labels: GhLabel[];
  assignees: GhUser[];
  draft?: boolean;
  merged?: boolean;
  merged_at: string | null;
  created_at: string;
  updated_at: string;
  closed_at?: string | null;
  head: GhBranchRef;
  base: GhBranchRef;
  mergeable?: boolean | null;
}

export interface GhComment {
  id: number;
  body: string;
  user: GhUser | null;
  html_url?: string;
  created_at: string;
  updated_at?: string;
}

/** `gh repo list --json nameWithOwner,description` entry. */
export interface GhRepoSummary {
  nameWithOwner: string;
  description: string | null;
}

/** `/repos/{repo}/branches` entry. */
export interface GhBranch {
  name: string;
  commit?: { sha: string; url?: string };
  protected?: boolean;
}

/** Cross-referenced PR found on an issue timeline (`gh-linked-prs`). */
export interface GhLinkedPr {
  number: number;
  title: string;
  state: GhIssueState;
  html_url: string;
}

/** `/repos/{repo}/pulls/{n}/merge` response. */
export interface GhMergeResult {
  sha?: string;
  merged: boolean;
  message: string;
}

/** `gh-create-pr` — `gh pr create` prints the PR URL. */
export interface GhCreatePrResult {
  url: string;
}

// ── Auth ────────────────────────────────────────────────────────────────────

export interface GhAuthAccount {
  login: string;
  active: boolean;
}

/** `gh-check-auth` (`user` null when logged out). */
export type GhCheckAuthResult = { ok: true; user: string | null } | { ok: false; error: string };

/** `gh-list-auth-accounts` */
export type GhListAuthAccountsResult = { ok: true; accounts: GhAuthAccount[] } | { ok: false; error: string };

/** `gh-switch-account` */
export type GhSwitchAccountResult = { ok: true; user: string } | { ok: false; error: string };

/** `gh-auth-logout` */
export type GhLogoutResult = { ok: true } | { ok: false; error: string };

/** `gh-auth-start` resolves immediately; progress arrives on `gh-auth-event`. */
export interface GhAuthStartResult {
  started: true;
}

/** `gh-auth-event` payloads from the `gh auth login --web` driver. */
export type GhAuthEvent =
  | { type: "code"; code: string }
  | { type: "browser"; url: string }
  | { type: "success"; user: string | null }
  | { type: "error"; error: string; output?: string }
  | { type: "cancelled" };

// ── Project Manager persisted state ─────────────────────────────────────────

/** `gh-save-pm-state` argument. */
export interface PmStateInput {
  /** `owner/repo` slugs. */
  repos: string[];
}

/** `gh-load-pm-state` result. Wallpaper is shared with the main window. */
export interface PmState {
  repos: string[];
  wallpaper: PersistedWallpaper | null;
}
