/** Commit / push / pull and GitHub pull requests for the current branch. */

import { generateCommitMessage } from "../services/claude-oneshot";
import { errorMessage } from "../services/errors";
import { git, gitLong } from "../services/git-ops";
import { withCoauthorTrailer } from "../services/git-parse";
import { createPullRequest, getCurrentBranchOpenPr, mergeCurrentBranchOpenPr, pushArgsFor } from "../services/git-pr";
import { handle } from "./typed";

const fail = (stderr: string): { ok: false; stderr: string } => ({ ok: false, stderr });

const currentBranch = (cwd: string): Promise<string> => git(["rev-parse", "--abbrev-ref", "HEAD"], cwd);

export function registerGitRemoteIpc(): void {
  handle("git-commit", async (_event, cwd, message, coauthor) => {
    if (!cwd) return fail("no cwd");
    if (!message?.trim()) return fail("empty message");
    try {
      const staged = await git(["diff", "--cached", "--name-only"], cwd);
      if (!staged.trim()) await git(["add", "-A"], cwd);
      const stdout = await git(["commit", "-m", withCoauthorTrailer(message, coauthor)], cwd);
      return { ok: true as const, stdout };
    } catch (err) {
      return fail(errorMessage(err));
    }
  });

  handle("git-push", async (_event, cwd) => {
    if (!cwd) return fail("no cwd");
    try {
      const branch = await currentBranch(cwd);
      const args = await pushArgsFor(cwd, branch);
      if (args.length > 1 && branch === "HEAD") return fail("detached HEAD; cannot push without a branch");
      return { ok: true as const, stdout: await gitLong(args, cwd) };
    } catch (err) {
      return fail(errorMessage(err));
    }
  });

  handle("git-pull", async (_event, cwd) => {
    if (!cwd) return fail("no cwd");
    try {
      return { ok: true as const, stdout: await gitLong(["pull", "--ff-only"], cwd) };
    } catch (err) {
      return fail(errorMessage(err));
    }
  });

  handle("git-pr-status", async (_event, cwd) => {
    if (!cwd) return fail("no cwd");
    try {
      const branch = await currentBranch(cwd);
      if (branch === "HEAD") return { ok: true as const, branch: null, openPr: null };
      return { ok: true as const, branch, openPr: await getCurrentBranchOpenPr(cwd, branch) };
    } catch (err) {
      return fail(errorMessage(err));
    }
  });

  handle("git-create-pr", (_event, cwd, base) => {
    if (!cwd) return fail("no cwd");
    return createPullRequest(cwd, base);
  });

  handle("git-merge-pr", async (_event, cwd) => {
    if (!cwd) return fail("no cwd");
    try {
      const branch = await currentBranch(cwd);
      if (branch === "HEAD") return fail("detached HEAD");
      const merged = await mergeCurrentBranchOpenPr(cwd, branch);
      if (!merged) return fail("No open upstream PR for this branch");
      if (!merged.merged) return fail(merged.message || `Failed to merge PR #${merged.openPr.number}`);
      return { ok: true as const, number: merged.openPr.number, url: merged.openPr.url, stdout: merged.message || "Pull request merged" };
    } catch (err) {
      return fail(errorMessage(err));
    }
  });

  handle("git-gen-commit-message", (_event, cwd) => {
    if (!cwd) return fail("no cwd");
    return generateCommitMessage(cwd);
  });
}
