/** Local git: branches, worktrees, status, staging, diff. */

import fs from "node:fs";
import path from "node:path";
import { errorMessage } from "../services/errors";
import { git, gitLong } from "../services/git-ops";
import { appendGitignoreEntry, parseBranchList, parseGithubRemoteSlug, parseStatusPorcelainV2, parseWorktreeList } from "../services/git-parse";
import { addWorktree, promoteWorktree } from "../services/git-worktree";
import { handle } from "./typed";

const DIFF_LIMIT = 64 * 1024;

const fail = (stderr: string): { ok: false; stderr: string } => ({ ok: false, stderr });

export function registerGitIpc(): void {
  handle("git-branches", async (_event, cwd) => {
    if (!cwd) return { current: null, branches: [] };
    try {
      return parseBranchList(await git(["branch", "--format=%(refname:short)\t%(HEAD)"], cwd));
    } catch {
      return { current: null, branches: [] };
    }
  });

  handle("git-create-branch", async (_event, cwd, branchName) => {
    await git(["checkout", "-b", branchName], cwd);
    return { success: true as const };
  });

  handle("git-checkout", async (_event, cwd, branchName) => {
    await git(["checkout", branchName], cwd);
    return { success: true as const };
  });

  handle("git-delete-branch", async (_event, cwd, branchName) => {
    await git(["branch", "-D", branchName], cwd);
    return { success: true as const };
  });

  handle("git-worktree-list", async (_event, cwd) => {
    if (!cwd) return [];
    try {
      return parseWorktreeList(await git(["worktree", "list", "--porcelain"], cwd));
    } catch {
      return [];
    }
  });

  handle("git-worktree-add", (_event, cwd, worktreePath, branchName, options) =>
    addWorktree(cwd, worktreePath, branchName, options ?? {}));

  handle("git-worktree-remove", async (_event, cwd, worktreePath) => {
    await git(["worktree", "remove", worktreePath], cwd);
    return { success: true as const };
  });

  handle("git-worktree-promote", (_event, mainRepoPath, worktreePath, branchName) =>
    promoteWorktree(mainRepoPath, worktreePath, branchName));

  handle("git-status", async (_event, cwd) => {
    if (!cwd) return null;
    try {
      return parseStatusPorcelainV2(await git(["status", "--porcelain=v2", "--branch"], cwd));
    } catch {
      return null;
    }
  });

  handle("git-remote-slug", async (_event, cwd) => {
    if (!cwd) return null;
    try {
      return parseGithubRemoteSlug(await git(["remote", "get-url", "origin"], cwd));
    } catch {
      return null;
    }
  });

  handle("git-fetch", async (_event, cwd) => {
    if (!cwd) return fail("no cwd");
    try {
      await gitLong(["fetch", "--no-tags", "--quiet"], cwd);
      return { ok: true as const };
    } catch (err) {
      return fail(errorMessage(err));
    }
  });

  handle("git-diff", async (_event, cwd) => {
    if (!cwd) return { diff: "", truncated: false };
    const raw = await git(["diff", "HEAD"], cwd).catch(() => git(["diff"], cwd)).catch(() => "");
    return { diff: raw.slice(0, DIFF_LIMIT), truncated: raw.length > DIFF_LIMIT };
  });

  handle("git-stage", async (_event, cwd, paths) => {
    if (!cwd) return fail("no cwd");
    try {
      await git(Array.isArray(paths) && paths.length ? ["add", "--", ...paths] : ["add", "-A"], cwd);
      return { ok: true as const };
    } catch (err) {
      return fail(errorMessage(err));
    }
  });

  handle("git-unstage", async (_event, cwd, paths) => {
    if (!cwd) return fail("no cwd");
    try {
      await git(Array.isArray(paths) && paths.length ? ["reset", "HEAD", "--", ...paths] : ["reset", "HEAD"], cwd);
      return { ok: true as const };
    } catch (err) {
      return fail(errorMessage(err));
    }
  });

  handle("git-revert", async (_event, cwd, filePath, untracked) => {
    if (!cwd || !filePath) return fail("bad args");
    try {
      if (untracked) await git(["clean", "-fd", "--", filePath], cwd);
      else await git(["restore", "--staged", "--worktree", "--source=HEAD", "--", filePath], cwd);
      return { ok: true as const };
    } catch (err) {
      return fail(errorMessage(err));
    }
  });

  handle("git-ignore", async (_event, cwd, filePath) => {
    if (!cwd || !filePath) return fail("bad args");
    try {
      const giPath = path.join(cwd, ".gitignore");
      const existing = await fs.promises.readFile(giPath, "utf8").catch(() => "");
      const next = appendGitignoreEntry(existing, filePath);
      if (next === null) return { ok: true as const, alreadyIgnored: true as const };
      await fs.promises.writeFile(giPath, next);
      return { ok: true as const };
    } catch (err) {
      return fail(errorMessage(err));
    }
  });
}
