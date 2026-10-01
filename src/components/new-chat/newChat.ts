/**
 * Pure logic behind the new-chat card: validation of the create request,
 * worktree branch naming, list filtering and draft (de)serialization.
 */

import type { Attachment } from "@shared/chat/types";
import type { GhIssue } from "@shared/github/types";
import type { ComposerDraft } from "../../utils/composerDrafts";

export type BranchMode = "existing" | "new";

/** What the card asks its parent to create. */
export interface NewChatRequest {
  cwd: string | null;
  prompt: string;
  model: string;
  branch?: string;
  branchMode: BranchMode;
  worktree: boolean;
  worktreeBaseBranch?: string;
  issueContext?: string;
  attachments?: Attachment[];
}

export interface NewChatFormState {
  prompt: string;
  model: string;
  cwd: string | null;
  branch: string;
  branchMode: BranchMode | null;
  worktree: boolean;
  worktreeName: string;
  currentBranch: string;
  issueContext: string | null;
  attachments: readonly Attachment[];
}

/** Error message keys (newChat.*) returned by validation. */
export type NewChatErrorKey =
  | "newChat.selectProjectBeforeBranchOrWorktree"
  | "newChat.pickBaseBranchFirst";

export type CreateResolution =
  | { kind: "empty" }
  | { kind: "error"; key: NewChatErrorKey }
  | { kind: "ok"; request: NewChatRequest };

/** `<base>-rayline-<suffix>` (base defaults to "rayline"). */
export function makeWorktreeBranchName(baseBranch: string | null | undefined, suffix: string = Math.random().toString(36).slice(2, 8)): string {
  const base = (baseBranch || "rayline").trim();
  return `${base}-rayline-${suffix}`;
}

/**
 * Validate the form and build the request. A worktree always creates a new
 * branch (named, or `<base>-rayline-<rand>`) off the chosen/current branch.
 */
export function resolveCreateRequest(form: NewChatFormState, randomSuffix?: string): CreateResolution {
  const prompt = form.prompt.trim();
  if (!prompt) return { kind: "empty" };
  let branch = form.branch.trim();
  let branchMode = form.branchMode;
  let worktreeBaseBranch: string | undefined;

  if ((branch || form.worktree) && !form.cwd) return { kind: "error", key: "newChat.selectProjectBeforeBranchOrWorktree" };

  if (form.worktree) {
    const base = branch || form.currentBranch;
    if (!base) return { kind: "error", key: "newChat.pickBaseBranchFirst" };
    worktreeBaseBranch = base;
    branch = form.worktreeName.trim() || makeWorktreeBranchName(base, randomSuffix);
    branchMode = "new";
  }

  return {
    kind: "ok",
    request: {
      cwd: form.cwd,
      prompt,
      model: form.model,
      branch: branch || undefined,
      branchMode: branchMode || "new",
      worktree: form.worktree,
      worktreeBaseBranch: form.worktree ? worktreeBaseBranch : undefined,
      issueContext: form.issueContext || undefined,
      attachments: form.attachments.length ? [...form.attachments] : undefined,
    },
  };
}

export function filterIssues<T extends Pick<GhIssue, "number" | "title">>(issues: readonly T[], query: string): T[] {
  if (!query) return [...issues];
  const needle = query.toLowerCase();
  return issues.filter((i) => `#${i.number} ${i.title}`.toLowerCase().includes(needle));
}

export function filterBranches(branches: readonly string[], query: string): string[] {
  if (!query) return [...branches];
  const needle = query.toLowerCase();
  return branches.filter((name) => name.toLowerCase().includes(needle));
}

/** Case-insensitive exact branch match for the typed query, or null. */
export function findExactBranch(branches: readonly string[], query: string): string | null {
  const needle = query.trim().toLowerCase();
  return branches.find((b) => b.toLowerCase() === needle) ?? null;
}

export function issueContextFor(issue: Pick<GhIssue, "number" | "title" | "body">): string {
  return `Issue #${issue.number}: ${issue.title}\n\n${issue.body || ""}`;
}

/** `#123` for a linked issue context, or null when none is linked. */
export function issueChipLabel(issueContext: string | null): string | null {
  if (!issueContext) return null;
  return `#${/Issue #(\d+)/.exec(issueContext)?.[1] || ""}`;
}

/** Preferred branch once branches load: `defaultBranch` if it exists, else current. */
export function preferredBranch(defaultBranch: string | null | undefined, current: string, branches: readonly string[]): string {
  return defaultBranch && branches.includes(defaultBranch) ? defaultBranch : current;
}

// ── Drafts ──────────────────────────────────────────────────────────────────

export interface NewChatDraft {
  prompt?: string;
  model?: string;
  /** Present (possibly null = Drafts) only when the draft recorded a project. */
  cwd?: string | null;
  branch?: string;
  branchMode?: BranchMode | null;
  worktree?: boolean;
  worktreeName?: string;
  issueContext?: string | null;
  attachments?: Attachment[];
}

export function newChatDraftScope(defaultCwd: string | null | undefined): string {
  return `new-chat:${defaultCwd || "drafts"}`;
}

function isAttachment(value: unknown): value is Attachment {
  if (typeof value !== "object" || value === null) return false;
  const type = (value as { type?: unknown }).type;
  if (type === "image") return typeof (value as { dataUrl?: unknown }).dataUrl === "string";
  return type === "file";
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** Validate a stored draft (written by any app version) field by field. */
export function parseNewChatDraft(draft: ComposerDraft): NewChatDraft {
  const result: NewChatDraft = {};
  const prompt = optionalString(draft.prompt) ?? optionalString(draft.text);
  if (prompt !== undefined) result.prompt = prompt;
  const model = optionalString(draft.model);
  if (model) result.model = model;
  if (Object.prototype.hasOwnProperty.call(draft, "cwd") && (draft.cwd === null || typeof draft.cwd === "string")) {
    result.cwd = draft.cwd;
  }
  const branch = optionalString(draft.branch);
  if (branch !== undefined) result.branch = branch;
  if (draft.branchMode === "existing" || draft.branchMode === "new") result.branchMode = draft.branchMode;
  if (typeof draft.worktree === "boolean") result.worktree = draft.worktree;
  const worktreeName = optionalString(draft.worktreeName);
  if (worktreeName !== undefined) result.worktreeName = worktreeName;
  const issueContext = optionalString(draft.issueContext);
  if (issueContext) result.issueContext = issueContext;
  if (Array.isArray(draft.attachments)) result.attachments = draft.attachments.filter(isAttachment);
  return result;
}
