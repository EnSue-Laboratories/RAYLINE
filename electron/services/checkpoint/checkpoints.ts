/** Create / restore git-backed worktree checkpoints. */

import { randomBytes } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";
import { assertGit, execGit, log, resolveRepoRoot } from "./git";
import {
  CHECKPOINT_REF_PREFIX,
  ZERO_OID,
  checkpointId,
  composeCheckpointMessage,
  parseCheckpointCommit,
} from "./metadata";
import { buildWorktreeTree, inspectWorktreeState, listCurrentUntrackedRoots } from "./worktree";

export interface CheckpointCreateResult {
  ref: string;
}

export interface CheckpointRestoreResult {
  success: true;
}

const CHECKPOINT_AUTHOR_ENV = {
  GIT_AUTHOR_NAME: "RayLine Checkpoint",
  GIT_AUTHOR_EMAIL: "checkpoint@rayline.local",
  GIT_COMMITTER_NAME: "RayLine Checkpoint",
  GIT_COMMITTER_EMAIL: "checkpoint@rayline.local",
};

/**
 * Snapshot HEAD + index + worktree as a commit under refs/claudi-checkpoints/.
 * The user's real staging area is never modified — the worktree tree is built
 * through a throwaway temp index. Untracked content is captured only when it
 * looks like small source/text; generated, binary and mixed roots are
 * preserved instead of restaged.
 */
export async function createCheckpoint(cwdPath: string): Promise<CheckpointCreateResult> {
  log("creating checkpoint in", cwdPath);
  const repoRoot = await resolveRepoRoot(cwdPath);
  log("resolved repo root:", repoRoot);

  const now = new Date();
  const id = checkpointId(now, randomBytes(3).toString("hex"));
  const refName = `${CHECKPOINT_REF_PREFIX}${id}`;
  log("checkpoint id:", id, "ref:", refName);

  // HEAD may be unborn.
  const headResult = await execGit(["rev-parse", "HEAD"], repoRoot);
  const headOid = headResult.exitCode === 0 ? headResult.stdout : ZERO_OID;
  log("HEAD OID:", headOid);

  const indexTree = assertGit(await execGit(["write-tree"], repoRoot), "git write-tree (index)");
  log("index tree:", indexTree);

  const worktreeState = await inspectWorktreeState(repoRoot);
  log(
    "untracked roots:", worktreeState.untrackedRoots.length,
    "exact paths:", worktreeState.exactUntrackedPathCount,
    "skipped roots:", worktreeState.skippedUntrackedRoots.length,
  );
  if (worktreeState.skippedUntrackedRoots.length > 0) {
    log("skipping non-source untracked roots:", worktreeState.skippedUntrackedRoots.join(", "));
  }

  const worktreeTree = await buildWorktreeTree(repoRoot, indexTree, worktreeState.capturePaths);
  log("worktree tree:", worktreeTree);

  const message = composeCheckpointMessage({
    id,
    headOid,
    indexTree,
    worktreeTree,
    createdAt: now.toISOString(),
    untrackedRoots: worktreeState.untrackedRoots,
    cleanableUntrackedDirRoots: worktreeState.cleanableUntrackedDirRoots,
  });
  const commitTreeArgs = ["commit-tree", worktreeTree, "-m", message];
  // Parent on HEAD so history is browsable; restore ignores the parent chain.
  if (headOid !== ZERO_OID) commitTreeArgs.push("-p", headOid);

  const commitOid = assertGit(await execGit(commitTreeArgs, repoRoot, CHECKPOINT_AUTHOR_ENV), "git commit-tree");
  log("commit OID:", commitOid);
  assertGit(await execGit(["update-ref", refName, commitOid], repoRoot), "git update-ref");

  log("checkpoint created:", id);
  return { ref: id };
}

/**
 * Revert the working tree and index to a checkpoint. Untracked roots that
 * appeared after the checkpoint are removed; roots that existed then (but
 * weren't captured) are preserved.
 */
export async function restoreCheckpoint(cwdPath: string, ref: string): Promise<CheckpointRestoreResult> {
  log("restoring checkpoint", ref, "in", cwdPath);
  const repoRoot = await resolveRepoRoot(cwdPath);
  log("resolved repo root:", repoRoot);

  const refName = `${CHECKPOINT_REF_PREFIX}${ref}`;
  const resolveResult = await execGit(["rev-parse", "--verify", refName], repoRoot);
  if (resolveResult.exitCode !== 0) {
    throw new Error(`[checkpoint] Cannot resolve ref ${refName}:\n${resolveResult.stderr}`);
  }
  const commitOid = resolveResult.stdout;
  log("resolved commit OID:", commitOid);

  const commitText = assertGit(await execGit(["cat-file", "commit", commitOid], repoRoot), `git cat-file for ${commitOid}`);
  log("parsing metadata from commit message");
  const meta = parseCheckpointCommit(commitText);
  if (!meta.worktreeTree) {
    throw new Error(`[checkpoint] Metadata incomplete in checkpoint ${ref} — missing worktree-tree`);
  }
  log("metadata — head:", meta.headOid, "index-tree:", meta.indexTree, "worktree-tree:", meta.worktreeTree);

  if (meta.headOid && meta.headOid !== ZERO_OID) {
    log("resetting HEAD to", meta.headOid);
    assertGit(await execGit(["reset", "--hard", meta.headOid], repoRoot), "git reset --hard");
  }

  log("restoring worktree from tree", meta.worktreeTree);
  assertGit(
    await execGit(["read-tree", "--reset", "-u", meta.worktreeTree], repoRoot),
    "git read-tree --reset -u (worktree)",
  );

  // Captured dirs can be `git clean`ed safely: their snapshot files are still
  // tracked in the worktree tree at this point.
  const currentUntrackedRoots = await listCurrentUntrackedRoots(repoRoot);
  const preserved = new Set(meta.untrackedRoots);
  const cleanable = new Set(meta.cleanableUntrackedDirRoots);
  log("cleaning untracked roots:", currentUntrackedRoots.length);

  for (const root of currentUntrackedRoots) {
    if (cleanable.has(root)) {
      const cleanResult = await execGit(["clean", "-fd", "--", root], repoRoot);
      if (cleanResult.exitCode !== 0) {
        log("warn: git clean -fd failed for preserved dir", root, cleanResult.exitCode, cleanResult.stderr);
      }
      continue;
    }
    if (preserved.has(root)) continue;
    await rm(path.join(repoRoot, root), { recursive: true, force: true }).catch((err: unknown) => {
      log("warn: failed to remove untracked root:", root, err instanceof Error ? err.message : err);
    });
  }

  if (meta.indexTree) {
    log("restoring index from tree", meta.indexTree);
    const readTreeIdxResult = await execGit(["read-tree", "--reset", meta.indexTree], repoRoot);
    if (readTreeIdxResult.exitCode !== 0) {
      // Non-fatal: the worktree is already correct.
      log("warn: git read-tree --reset (index) exited with", readTreeIdxResult.exitCode, readTreeIdxResult.stderr);
    }
  }

  log("checkpoint restored:", ref);
  return { success: true };
}
