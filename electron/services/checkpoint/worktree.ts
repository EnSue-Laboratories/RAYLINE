/** Inspect the worktree and snapshot it into a tree via a throwaway index. */

import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { mapWithConcurrency } from "../sessions/limiter";
import { assertGit, execGit, log } from "./git";
import {
  isCaptureCandidate,
  normalizeUntrackedPath,
  parseUntrackedPaths,
  shouldCaptureUntrackedFile,
  shouldSkipUntrackedDir,
  splitNullTerminated,
} from "./paths";

const STAT_CONCURRENCY = 16;

export interface WorktreeState {
  trackedDeltaPaths: string[];
  /** Tracked deltas + captured untracked files (deduped). */
  capturePaths: string[];
  untrackedRoots: string[];
  /** Untracked dirs fully captured — safe to `git clean` on restore. */
  cleanableUntrackedDirRoots: string[];
  skippedUntrackedRoots: string[];
  exactUntrackedPathCount: number;
}

export async function listCurrentUntrackedRoots(repoRoot: string): Promise<string[]> {
  const result = await execGit(["status", "--porcelain=v1", "-z", "--untracked-files=normal"], repoRoot);
  return parseUntrackedPaths(assertGit(result, "git status --untracked-files=normal"));
}

async function isDirectory(fullPath: string): Promise<boolean | null> {
  try {
    return (await stat(fullPath)).isDirectory();
  } catch {
    return null;
  }
}

/** Every path captured? Cheap name filter first, then sizes in parallel. */
async function allCapturable(repoRoot: string, paths: readonly string[]): Promise<boolean> {
  if (paths.length === 0 || !paths.every(isCaptureCandidate)) return false;
  const results = await mapWithConcurrency(paths, STAT_CONCURRENCY, (p) => shouldCaptureUntrackedFile(repoRoot, p));
  return results.every(Boolean);
}

export async function inspectWorktreeState(repoRoot: string): Promise<WorktreeState> {
  const [trackedDeltaResult, untrackedAllResult, untrackedNormalResult] = await Promise.all([
    execGit(["diff-files", "--name-only", "-z"], repoRoot),
    execGit(["status", "--porcelain=v1", "-z", "--untracked-files=all"], repoRoot),
    execGit(["status", "--porcelain=v1", "-z", "--untracked-files=normal"], repoRoot),
  ]);

  const trackedDeltaPaths = splitNullTerminated(assertGit(trackedDeltaResult, "git diff-files"));
  const untrackedAllPaths = parseUntrackedPaths(assertGit(untrackedAllResult, "git status --untracked-files=all"));
  const untrackedRoots = parseUntrackedPaths(assertGit(untrackedNormalResult, "git status --untracked-files=normal"));

  const classified = await mapWithConcurrency(untrackedRoots, STAT_CONCURRENCY, async (root) => {
    const normalizedRoot = normalizeUntrackedPath(root);
    const dir = await isDirectory(path.join(repoRoot, normalizedRoot));
    if (dir === null) return { root, kind: "missing" as const };
    if (!dir) {
      return (await shouldCaptureUntrackedFile(repoRoot, normalizedRoot))
        ? { root, kind: "file" as const, paths: [normalizedRoot] }
        : { root, kind: "skip" as const };
    }
    if (shouldSkipUntrackedDir(root)) return { root, kind: "skip" as const };
    const dirPaths = untrackedAllPaths.filter((candidate) => candidate.startsWith(root));
    return (await allCapturable(repoRoot, dirPaths))
      ? { root, kind: "dir" as const, paths: dirPaths.map(normalizeUntrackedPath) }
      : { root, kind: "skip" as const };
  });

  const captureUntrackedPaths: string[] = [];
  const cleanableUntrackedDirRoots: string[] = [];
  const skippedUntrackedRoots: string[] = [];
  for (const entry of classified) {
    switch (entry.kind) {
      case "missing":
        break;
      case "skip":
        skippedUntrackedRoots.push(entry.root);
        break;
      case "file":
        captureUntrackedPaths.push(...entry.paths);
        break;
      case "dir":
        captureUntrackedPaths.push(...entry.paths);
        cleanableUntrackedDirRoots.push(entry.root);
        break;
      default: {
        const unreachable: never = entry;
        throw new Error(`unexpected entry ${String(unreachable)}`);
      }
    }
  }

  return {
    trackedDeltaPaths,
    capturePaths: [...new Set([...trackedDeltaPaths, ...captureUntrackedPaths])],
    untrackedRoots,
    cleanableUntrackedDirRoots,
    skippedUntrackedRoots,
    exactUntrackedPathCount: captureUntrackedPaths.length,
  };
}

/**
 * Tree of index + captured worktree paths, built in a temp index so the
 * user's real staging area is never touched.
 */
export async function buildWorktreeTree(repoRoot: string, indexTree: string, capturePaths: readonly string[]): Promise<string> {
  log("worktree delta paths:", capturePaths.length);
  if (capturePaths.length === 0) {
    log("no captured worktree paths; reusing index tree for checkpoint snapshot");
    return indexTree;
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "claudi-cp-"));
  const tempIndex = path.join(tempDir, "index");
  const pathspecFile = path.join(tempDir, "paths");
  const env = { GIT_INDEX_FILE: tempIndex };

  try {
    log("building worktree tree with temp index:", tempIndex);
    assertGit(await execGit(["read-tree", indexTree], repoRoot, env), "git read-tree (temp index)");
    await writeFile(pathspecFile, Buffer.from(`${capturePaths.join("\0")}\0`));
    assertGit(
      await execGit(["add", "-A", `--pathspec-from-file=${pathspecFile}`, "--pathspec-file-nul"], repoRoot, env),
      "git add -A (temp index)",
    );
    return assertGit(await execGit(["write-tree"], repoRoot, env), "git write-tree (worktree)");
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch((err: unknown) => {
      log("warn: failed to clean up temp dir:", tempDir, err instanceof Error ? err.message : err);
    });
  }
}
