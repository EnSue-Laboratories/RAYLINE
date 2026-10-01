/** GitHub REST operations via `gh api` / `gh repo|pr`. Reject with gh's stderr. */

import { execFile } from "node:child_process";
import type {
  GhBranch,
  GhComment,
  GhCreatePrResult,
  GhIssue,
  GhLinkedPr,
  GhMergeResult,
  GhPullRequest,
  GhRepoSummary,
  GhStateFilter,
  GhUser,
} from "@shared/github/types";
import type { GitSuccess } from "@shared/git/types";
import { buildSpawnPath } from "../../cli-bin-resolver";
import { gh, ghWithInput, ghWithJson, parseGhJson, parseGhJsonArray } from "./gh-cli";
import {
  crossReferencedPr,
  isGhBranch,
  isGhComment,
  isGhIssue,
  isGhMergeResult,
  isGhPullRequest,
  isGhRepoSummary,
  isGhUser,
} from "./guards";

const REPO_FIELDS = "nameWithOwner,description";

async function listRepos(owner: string | null, limit: number): Promise<GhRepoSummary[]> {
  const args = ["repo", "list", ...(owner ? [owner] : []), "--json", REPO_FIELDS, "--limit", String(limit)];
  return parseGhJsonArray(await gh(args), isGhRepoSummary, "repo list");
}

/** Personal + organization repos, deduplicated by `nameWithOwner`. */
export async function listUserRepos(limit = 100): Promise<GhRepoSummary[]> {
  const personal = await listRepos(null, limit);
  let orgRepos: GhRepoSummary[] = [];
  try {
    const orgs = (await gh(["api", "/user/orgs", "--jq", ".[].login"])).split("\n").filter(Boolean);
    const results = await Promise.all(orgs.map((org) => listRepos(org, limit).catch((): GhRepoSummary[] => [])));
    orgRepos = results.flat();
  } catch {
    /* no orgs or no access */
  }
  const seen = new Set<string>();
  return [...personal, ...orgRepos].filter((repo) => {
    if (seen.has(repo.nameWithOwner)) return false;
    seen.add(repo.nameWithOwner);
    return true;
  });
}

export async function listIssues(repo: string, state: GhStateFilter = "open"): Promise<GhIssue[]> {
  const items = parseGhJsonArray(await gh(["api", `/repos/${repo}/issues?state=${state}&per_page=100`]), isGhIssue, "issues");
  // The issues endpoint also returns pull requests.
  return items.filter((item) => !item.pull_request);
}

export async function listPRs(repo: string, state: GhStateFilter = "open"): Promise<GhPullRequest[]> {
  return parseGhJsonArray(await gh(["api", `/repos/${repo}/pulls?state=${state}&per_page=100`]), isGhPullRequest, "pulls");
}

export async function getIssue(repo: string, number: number): Promise<GhIssue> {
  return parseGhJson(await gh(["api", `/repos/${repo}/issues/${number}`]), isGhIssue, "issue");
}

export async function getPR(repo: string, number: number): Promise<GhPullRequest> {
  return parseGhJson(await gh(["api", `/repos/${repo}/pulls/${number}`]), isGhPullRequest, "pull request");
}

export async function listComments(repo: string, number: number): Promise<GhComment[]> {
  return parseGhJsonArray(await gh(["api", `/repos/${repo}/issues/${number}/comments`]), isGhComment, "comments");
}

export async function addComment(repo: string, number: number, body: string): Promise<GhComment> {
  const raw = await gh(["api", `/repos/${repo}/issues/${number}/comments`, "-f", `body=${body}`]);
  return parseGhJson(raw, isGhComment, "comment");
}

export async function listCollaborators(repo: string): Promise<GhUser[]> {
  return parseGhJsonArray(await gh(["api", `/repos/${repo}/collaborators`]), isGhUser, "collaborators");
}

export async function assignIssue(repo: string, number: number, assignees: readonly string[]): Promise<GhIssue> {
  const args = ["api", `/repos/${repo}/issues/${number}`, "-X", "PATCH"];
  for (const user of assignees) args.push("-f", `assignees[]=${user}`);
  return parseGhJson(await gh(args), isGhIssue, "issue");
}

export async function unassignIssue(repo: string, number: number, assignees: readonly string[]): Promise<GhIssue> {
  const raw = await ghWithJson(["api", `/repos/${repo}/issues/${number}/assignees`, "-X", "DELETE", "--input", "-"], {
    assignees,
  });
  return parseGhJson(raw, isGhIssue, "issue");
}

/** `gh pr checkout` in the main process cwd (fetches the branch). */
export async function checkoutPR(repo: string, prNumber: number): Promise<GitSuccess> {
  await gh(["pr", "checkout", String(prNumber), "-R", repo]);
  return { success: true };
}

async function setIssueState(repo: string, number: number, state: "open" | "closed"): Promise<GhIssue> {
  const raw = await gh(["api", `/repos/${repo}/issues/${number}`, "-X", "PATCH", "-f", `state=${state}`]);
  return parseGhJson(raw, isGhIssue, "issue");
}

export function closeIssue(repo: string, number: number): Promise<GhIssue> {
  return setIssueState(repo, number, "closed");
}

export function reopenIssue(repo: string, number: number): Promise<GhIssue> {
  return setIssueState(repo, number, "open");
}

export async function mergePR(repo: string, number: number): Promise<GhMergeResult> {
  return parseGhJson(await gh(["api", `/repos/${repo}/pulls/${number}/merge`, "-X", "PUT"]), isGhMergeResult, "merge");
}

export async function createIssue(repo: string, title: string, body?: string): Promise<GhIssue> {
  const raw = await ghWithJson(["api", `/repos/${repo}/issues`, "--input", "-"], { title, body: body || "" });
  return parseGhJson(raw, isGhIssue, "issue");
}

export async function createPR(
  repo: string,
  title: string,
  body: string | undefined,
  head: string,
  base?: string,
): Promise<GhCreatePrResult> {
  const args = ["pr", "create", "-R", repo, "--title", title, "--head", head, "--base", base || "main", "--body-file", "-"];
  // gh pr create prints the PR URL, not JSON.
  return { url: await ghWithInput(args, body || "") };
}

export async function listBranches(repo: string): Promise<GhBranch[]> {
  return parseGhJsonArray(await gh(["api", `/repos/${repo}/branches?per_page=100`]), isGhBranch, "branches");
}

/** Current branch of the main process cwd, or null. */
export function getCurrentBranch(): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      "git",
      ["rev-parse", "--abbrev-ref", "HEAD"],
      { env: { ...process.env, PATH: buildSpawnPath() }, timeout: 5000, encoding: "utf8" },
      (err, stdout) => resolve(err ? null : stdout.trim()),
    );
  });
}

export async function getRepoDefaultBranch(repo: string): Promise<string> {
  try {
    return (await gh(["api", `/repos/${repo}`, "--jq", ".default_branch"])) || "main";
  } catch {
    return "main";
  }
}

export function uploadImage(_repo: string, _base64Data: string, _filename: string): Promise<never> {
  return Promise.reject(
    new Error("GitHub image upload is not implemented. Remove pasted images or paste a GitHub-hosted image URL instead."),
  );
}

/** PRs cross-referenced from an issue's timeline (deduped by number). */
export async function getLinkedPRs(repo: string, issueNumber: number): Promise<GhLinkedPr[]> {
  const raw = await gh([
    "api",
    `/repos/${repo}/issues/${issueNumber}/timeline`,
    "-H",
    "Accept: application/vnd.github.mockingbird-preview+json",
    "--paginate",
  ]);
  return linkedPrsFromTimeline(JSON.parse(raw) as unknown);
}

export function linkedPrsFromTimeline(events: unknown): GhLinkedPr[] {
  if (!Array.isArray(events)) return [];
  const prs: GhLinkedPr[] = [];
  const seen = new Set<number>();
  for (const event of events as unknown[]) {
    const pr = crossReferencedPr(event);
    if (!pr || typeof pr.number !== "number" || seen.has(pr.number)) continue;
    seen.add(pr.number);
    prs.push({
      number: pr.number,
      title: typeof pr.title === "string" ? pr.title : "",
      state: pr.state === "closed" ? "closed" : "open",
      html_url: typeof pr.html_url === "string" ? pr.html_url : "",
    });
  }
  return prs;
}
