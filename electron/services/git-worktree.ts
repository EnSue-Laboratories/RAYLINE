/** `git worktree` add (with automatic repair) and promote. */

import fs from "node:fs";
import path from "node:path";
import type { GitWorktreeAddOptions, GitWorktreeAddResult, GitWorktreePromoteResult } from "@shared/git/types";
import { errorMessage } from "./errors";
import { git, gitLong } from "./git-ops";

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Repairs all corrupt loose git objects mentioned in a git error message
 * ("(stored in PATH)" and "unable to read sha1 file of FILE (HASH)" formats).
 * Returns the repo root the objects belong to.
 */
export async function repairAllCorruptObjects(errMessage: string, cwd: string): Promise<string> {
  // 1. Explicitly listed file paths from "(stored in PATH)"
  const filesToDelete = new Set<string>();
  for (const m of errMessage.matchAll(/\(stored in ([^)]+)\)/gi)) {
    if (m[1]) filesToDelete.add(m[1].trim());
  }

  // 2. Objects dir from stored paths (or fall back to cwd)
  let objectsDir = path.join(cwd, ".git", "objects");
  let repoRoot = cwd;
  const [first] = filesToDelete;
  if (first) {
    // first = repo/.git/objects/xx/hashfile → up 2 = objects dir; objects/ → .git/ → repo/
    objectsDir = path.dirname(path.dirname(first));
    repoRoot = path.dirname(path.dirname(objectsDir));
  }

  // 3. Every 40-char hash in the error → its loose object path
  for (const m of errMessage.matchAll(/\b([0-9a-f]{40})\b/gi)) {
    const hash = m[1] ?? "";
    filesToDelete.add(path.join(objectsDir, hash.slice(0, 2), hash.slice(2)));
  }

  // 4. Delete corrupt files; if delete fails, truncate so git skips them
  for (const looseFile of filesToDelete) {
    await fs.promises.unlink(looseFile).catch(() => undefined);
    if (await exists(looseFile)) await fs.promises.writeFile(looseFile, Buffer.alloc(0)).catch(() => undefined);
  }

  // 5. Fetch to restore objects from the remote (may fail without a remote)
  await git(["fetch", "--prune", "--quiet"], repoRoot).catch(() => undefined);
  return repoRoot;
}

async function ensureWorktreesIgnored(cwd: string, worktreePath: string): Promise<void> {
  await fs.promises.mkdir(path.dirname(worktreePath), { recursive: true });
  const gitignorePath = path.join(cwd, ".gitignore");
  try {
    const gi = await fs.promises.readFile(gitignorePath, "utf-8").catch(() => "");
    if (!gi.includes(".worktrees")) await fs.promises.appendFile(gitignorePath, "\n.worktrees/\n");
  } catch {
    // best effort
  }
}

const CORRUPT_OBJECT_RE = /corrupt\s+loose\s+object|loose\s+object.*is\s+corrupt|unable to read sha1 file|Could not reset index/i;
const BRANCH_EXISTS_RE = /a branch named .* already exists/i;

/** `git-worktree-add` — rejects on failure after automatic repair attempts. */
export async function addWorktree(
  cwd: string,
  worktreePath: string,
  branchName: string,
  options: GitWorktreeAddOptions = {},
): Promise<GitWorktreeAddResult> {
  await ensureWorktreesIgnored(cwd, worktreePath);
  const createBranch = options.createBranch !== false;
  const startPoint = options.startPoint;
  const args = ["worktree", "add", worktreePath];
  if (createBranch) {
    args.push("-b", branchName);
    if (startPoint) args.push(startPoint);
  } else if (branchName) {
    args.push(branchName);
  } else if (startPoint) {
    args.push(startPoint);
  }

  const attempt = async (): Promise<Error | null> => {
    try {
      await git(args, cwd);
      return null;
    } catch (error) {
      return error instanceof Error ? error : new Error(String(error));
    }
  };

  // Phase 1 → Phase 2 (retry) → Phase 3 (branch-exists cleanup) → Phase 4 (final retry)
  let worktreeErr = await attempt();
  if (!worktreeErr) return { success: true, path: worktreePath };

  const msg1 = worktreeErr.message;
  let repairRepoRoot = cwd;
  // Phase 1: single recovery action based on the first error
  if (CORRUPT_OBJECT_RE.test(msg1)) {
    repairRepoRoot = await repairAllCorruptObjects(msg1, cwd);
  } else if (/not a valid object name[^']*'?HEAD'?/i.test(msg1)) {
    await git(["commit", "--allow-empty", "-m", "init"], cwd);
  } else if (BRANCH_EXISTS_RE.test(msg1)) {
    await git(["branch", "-D", branchName], cwd).catch(() => undefined);
  } else {
    throw worktreeErr;
  }

  // Phase 2: first retry
  worktreeErr = await attempt();

  // Phase 3: the first attempt may have created the branch before failing
  if (worktreeErr && BRANCH_EXISTS_RE.test(worktreeErr.message)) {
    await git(["branch", "-D", branchName], cwd).catch(() => undefined);
    worktreeErr = await attempt();
  }

  // Phase 4: still failing — helpful error for object problems, rethrow otherwise
  if (worktreeErr) {
    if (/corrupt|unable to read sha1|Could not reset index/i.test(worktreeErr.message)) {
      throw new Error(
        `Repository has corrupt or missing git objects that could not be repaired automatically.\n` +
        `Please fix your repository:\n  cd "${repairRepoRoot}"\n  git fetch --prune\n  git fsck`,
      );
    }
    throw worktreeErr;
  }
  return { success: true, path: worktreePath };
}

const IN_PROGRESS_MARKERS: ReadonlyArray<readonly [string, string]> = [
  ["MERGE_HEAD", "merge"],
  ["REBASE_HEAD", "rebase"],
  ["rebase-merge", "rebase"],
  ["rebase-apply", "rebase"],
  ["CHERRY_PICK_HEAD", "cherry-pick"],
  ["REVERT_HEAD", "revert"],
  ["BISECT_LOG", "bisect"],
];

/** `git-worktree-promote`: check out the worktree's branch in the main repo and drop the worktree. */
export async function promoteWorktree(
  mainRepoPath: string,
  worktreePath: string,
  branchName: string | null | undefined,
): Promise<GitWorktreePromoteResult> {
  if (!mainRepoPath || !worktreePath) return { success: false, error: "missing paths" };
  try {
    const porcelain = await git(["status", "--porcelain"], mainRepoPath);
    if (porcelain.trim().length > 0) return { success: false, code: "DIRTY", error: "Main repo has uncommitted changes" };
    const gitDirRaw = await git(["rev-parse", "--git-dir"], mainRepoPath);
    const gitDir = path.isAbsolute(gitDirRaw) ? gitDirRaw : path.join(mainRepoPath, gitDirRaw);
    for (const [file, label] of IN_PROGRESS_MARKERS) {
      if (await exists(path.join(gitDir, file))) {
        return { success: false, code: "BUSY", error: `Main repo has an in-progress ${label}` };
      }
    }
  } catch (err) {
    return { success: false, error: errorMessage(err) || "Failed to check main repo" };
  }
  try {
    const worktreePorcelain = await git(["status", "--porcelain"], worktreePath);
    if (worktreePorcelain.trim().length > 0) {
      return { success: false, code: "WORKTREE_DIRTY", error: "Worktree has uncommitted changes" };
    }
  } catch (err) {
    return { success: false, error: errorMessage(err) || "Failed to check worktree" };
  }

  if (branchName) {
    try {
      await git(["checkout", "--detach"], worktreePath);
      await git(["checkout", branchName], mainRepoPath);
    } catch (err) {
      await git(["checkout", branchName], worktreePath).catch(() => undefined);
      return { success: false, error: errorMessage(err) || "Failed to checkout branch in main repo" };
    }
    setTimeout(() => {
      gitLong(["worktree", "remove", worktreePath], mainRepoPath).catch((err: unknown) => {
        console.warn("[git-worktree-promote] background worktree cleanup failed:", errorMessage(err));
      });
    }, 0).unref();
    return { success: true, cleanupPending: true };
  }

  try {
    await gitLong(["worktree", "remove", worktreePath], mainRepoPath);
  } catch (err) {
    return { success: false, error: errorMessage(err) || "Failed to remove worktree" };
  }
  return { success: true };
}
