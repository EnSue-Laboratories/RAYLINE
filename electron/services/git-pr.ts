/** Pull-request helpers for the current branch (GitHub via `gh`). */

import type { GitCreatePrOk, GitOpResult, GitOpenPr } from "@shared/git/types";
import { errorMessage } from "./errors";
import { gh, git, gitLong } from "./git-ops";
import { extractPrNumber, normalizeOpenPr } from "./git-parse";

interface RepoPrContext {
  currentRepo: string | null;
  baseRepo: string | null;
  headOwner: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function nameWithOwner(value: unknown): string | null {
  return isRecord(value) && typeof value.nameWithOwner === "string" && value.nameWithOwner ? value.nameWithOwner : null;
}

async function getRepoPrContext(cwd: string): Promise<RepoPrContext> {
  const repo: unknown = JSON.parse(await gh(["repo", "view", "--json", "nameWithOwner,parent"], cwd));
  const currentRepo = nameWithOwner(repo);
  const baseRepo = (isRecord(repo) ? nameWithOwner(repo.parent) : null) ?? currentRepo;
  const headOwner = currentRepo?.split("/")[0] ?? null;
  return { currentRepo, baseRepo, headOwner };
}

/** Open PR for `branch` against the upstream (parent) repo, or null. */
export async function getCurrentBranchOpenPr(cwd: string, branch: string): Promise<GitOpenPr | null> {
  const { baseRepo, headOwner } = await getRepoPrContext(cwd);
  if (!baseRepo || !headOwner || !branch) return null;
  const raw = await gh(
    ["api", "--method", "GET", `/repos/${baseRepo}/pulls`, "-f", "state=open", "-f", `head=${headOwner}:${branch}`],
    cwd,
  );
  const prs: unknown = JSON.parse(raw);
  if (!Array.isArray(prs) || prs.length === 0) return null;
  return normalizeOpenPr(prs[0]);
}

export interface MergeResult {
  openPr: GitOpenPr;
  merged: boolean;
  message: string | null;
}

export async function mergeCurrentBranchOpenPr(cwd: string, branch: string): Promise<MergeResult | null> {
  const { baseRepo } = await getRepoPrContext(cwd);
  const openPr = await getCurrentBranchOpenPr(cwd, branch);
  if (!baseRepo || !openPr) return null;
  const raw = await gh(["api", "--method", "PUT", `/repos/${baseRepo}/pulls/${openPr.number}/merge`], cwd, { timeout: 60000 });
  const result: unknown = JSON.parse(raw);
  return {
    openPr,
    merged: !(isRecord(result) && result.merged === false),
    message: isRecord(result) && typeof result.message === "string" ? result.message : null,
  };
}

async function hasUpstream(cwd: string): Promise<boolean> {
  try {
    await git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], cwd);
    return true;
  } catch {
    return false;
  }
}

/** Push args for the current branch: plain push with an upstream, else `-u origin <branch>`. */
export async function pushArgsFor(cwd: string, branch: string): Promise<string[]> {
  return (await hasUpstream(cwd)) ? ["push"] : ["push", "-u", "origin", branch];
}

/** `git-create-pr` */
export async function createPullRequest(cwd: string, base: string | undefined): Promise<GitOpResult<GitCreatePrOk>> {
  try {
    const branch = await git(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
    if (branch === "HEAD") return { ok: false, stderr: "detached HEAD" };
    if (base && branch === base) return { ok: false, stderr: `already on base branch "${base}"` };
    const openPr = await getCurrentBranchOpenPr(cwd, branch);
    if (openPr) {
      return { ok: false, stderr: `Open PR #${openPr.number} already exists\n${openPr.url ?? ""}`.trim() };
    }
    // Ensure upstream exists and is current.
    await gitLong(await pushArgsFor(cwd, branch), cwd);
    const ghArgs = ["pr", "create", "--fill"];
    if (base) ghArgs.push("--base", base);
    const stdout = await gh(ghArgs, cwd, { timeout: 60000 });
    const url = /https?:\/\/\S+/.exec(stdout)?.[0] ?? null;
    return { ok: true, action: "created", number: extractPrNumber(url), url, stdout };
  } catch (err) {
    const msg = errorMessage(err);
    const existing = /https?:\/\/github\.com\/\S+\/pull\/\d+/.exec(msg);
    if (existing) {
      return { ok: false, stderr: `Open PR #${extractPrNumber(existing[0]) ?? "?"} already exists\n${existing[0]}` };
    }
    return { ok: false, stderr: msg };
  }
}
