"use strict";

const { execFile } = require("child_process");
const { randomBytes } = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function log(...args) {
  console.log("[checkpoint]", ...args);
}

// ---------------------------------------------------------------------------
// Git helper
// ---------------------------------------------------------------------------

/**
 * Spawn git with the given args inside cwdPath.
 * Optional envOverrides are merged on top of the current process env.
 *
 * @param {string[]} args
 * @param {string} cwdPath
 * @param {Record<string, string>} [envOverrides]
 * @returns {Promise<{ stdout: string; stderr: string; exitCode: number }>}
 */
async function execGit(args, cwdPath, envOverrides = {}) {
  try {
    const { stdout, stderr } = await execFileAsync("git", args, {
      cwd: cwdPath,
      env: { ...process.env, ...envOverrides },
      // Large repos can produce sizable tree output
      maxBuffer: 100 * 1024 * 1024,
    });
    return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0 };
  } catch (err) {
    // execFile rejects on non-zero exit; the error carries stdout/stderr
    return {
      stdout: (err.stdout || "").trim(),
      stderr: (err.stderr || "").trim(),
      exitCode: err.code ?? 1,
    };
  }
}

async function resolveRepoRoot(cwdPath) {
  const repoRootResult = await execGit(["rev-parse", "--show-toplevel"], cwdPath);
  if (repoRootResult.exitCode !== 0) {
    // Auto-init git repo for checkpoint support
    log("No git repo found, initializing:", cwdPath);
    const initResult = await execGit(["init"], cwdPath);
    if (initResult.exitCode !== 0) {
      throw new Error(`[checkpoint] Failed to init git repo: ${cwdPath}\n${initResult.stderr}`);
    }
    // Create initial commit so HEAD exists
    await execGit(["add", "-A", "--", "."], cwdPath);
    await execGit(
      ["commit", "--allow-empty", "-m", "claudi: initial checkpoint"],
      cwdPath,
      {
        GIT_AUTHOR_NAME: "Claudi",
        GIT_AUTHOR_EMAIL: "claudi@noreply",
        GIT_COMMITTER_NAME: "Claudi",
        GIT_COMMITTER_EMAIL: "claudi@noreply",
      }
    );
    log("Git repo initialized:", cwdPath);
    return cwdPath;
  }
  return repoRootResult.stdout;
}

// ---------------------------------------------------------------------------
// createCheckpoint
// ---------------------------------------------------------------------------

/**
 * Snapshot the current working state (HEAD + index + worktree) as a git ref
 * under refs/claudi-checkpoints/.  The user's real staging area is never
 * modified — the worktree tree is built through a throwaway temp index.
 *
 * @param {string} cwdPath  Absolute path to a git repository root (or subdir)
 * @returns {Promise<{ ref: string }>}
 */
async function createCheckpoint(cwdPath) {
  log("creating checkpoint in", cwdPath);
  const repoRoot = await resolveRepoRoot(cwdPath);
  log("resolved repo root:", repoRoot);

  // 2. Generate checkpoint ID and ref name
  const now = new Date();
  const pad = (n, len = 2) => String(n).padStart(len, "0");
  const entropy = randomBytes(3).toString("hex");
  const id = [
    "cp",
    [
      now.getUTCFullYear(),
      pad(now.getUTCMonth() + 1),
      pad(now.getUTCDate()),
    ].join("") +
      "T" +
      [
        pad(now.getUTCHours()),
        pad(now.getUTCMinutes()),
        pad(now.getUTCSeconds()),
      ].join("") +
      pad(now.getUTCMilliseconds(), 3) +
      "Z",
    entropy,
  ].join("-");

  const refName = `refs/claudi-checkpoints/${id}`;
  log("checkpoint id:", id, "ref:", refName);

  // 3. Capture HEAD OID (handle unborn HEAD gracefully)
  const headResult = await execGit(["rev-parse", "HEAD"], repoRoot);
  const headOid =
    headResult.exitCode === 0
      ? headResult.stdout
      : "0000000000000000000000000000000000000000";
  log("HEAD OID:", headOid);

  // 4. Capture the current index tree (real index, untouched)
  const indexTreeResult = await execGit(["write-tree"], repoRoot);
  if (indexTreeResult.exitCode !== 0) {
    throw new Error(
      `[checkpoint] git write-tree (index) failed:\n${indexTreeResult.stderr}`
    );
  }
  const indexTree = indexTreeResult.stdout;
  log("index tree:", indexTree);

  // 5. Capture the worktree tree via a temporary index
  let worktreeTree;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "claudi-cp-"));
  const tempIndex = path.join(tempDir, "index");
  try {
    log("building worktree tree with temp index:", tempIndex);

    const addResult = await execGit(["add", "-A", "--", "."], repoRoot, {
      GIT_INDEX_FILE: tempIndex,
    });
    if (addResult.exitCode !== 0) {
      throw new Error(
        `[checkpoint] git add -A (temp index) failed:\n${addResult.stderr}`
      );
    }

    const worktreeTreeResult = await execGit(["write-tree"], repoRoot, {
      GIT_INDEX_FILE: tempIndex,
    });
    if (worktreeTreeResult.exitCode !== 0) {
      throw new Error(
        `[checkpoint] git write-tree (worktree) failed:\n${worktreeTreeResult.stderr}`
      );
    }
    worktreeTree = worktreeTreeResult.stdout;
    log("worktree tree:", worktreeTree);
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (cleanupErr) {
      log("warn: failed to clean up temp dir:", tempDir, cleanupErr.message);
    }
  }

  // 6. Compose the metadata commit message
  const createdAt = now.toISOString();
  const commitMessage = [
    `checkpoint:${id}`,
    `head ${headOid}`,
    `index-tree ${indexTree}`,
    `worktree-tree ${worktreeTree}`,
    `created ${createdAt}`,
  ].join("\n");

  // 7. Create the commit object (Inspector-style author env vars)
  const authorEnv = {
    GIT_AUTHOR_NAME: "Claudi Checkpoint",
    GIT_AUTHOR_EMAIL: "checkpoint@claudi.local",
    GIT_COMMITTER_NAME: "Claudi Checkpoint",
    GIT_COMMITTER_EMAIL: "checkpoint@claudi.local",
  };

  const commitTreeArgs = ["commit-tree", worktreeTree, "-m", commitMessage];
  // If HEAD is a real commit, parent the checkpoint against it so history is
  // browsable, but this is purely cosmetic — restore ignores the parent chain.
  if (headOid !== "0000000000000000000000000000000000000000") {
    commitTreeArgs.push("-p", headOid);
  }

  const commitResult = await execGit(commitTreeArgs, repoRoot, authorEnv);
  if (commitResult.exitCode !== 0) {
    throw new Error(
      `[checkpoint] git commit-tree failed:\n${commitResult.stderr}`
    );
  }
  const commitOid = commitResult.stdout;
  log("commit OID:", commitOid);

  // 8. Store the ref
  const updateRefResult = await execGit(
    ["update-ref", refName, commitOid],
    repoRoot
  );
  if (updateRefResult.exitCode !== 0) {
    throw new Error(
      `[checkpoint] git update-ref failed:\n${updateRefResult.stderr}`
    );
  }

  log("checkpoint created:", id);
  return { ref: id };
}

// ---------------------------------------------------------------------------
// restoreCheckpoint
// ---------------------------------------------------------------------------

/**
 * Revert the working tree (and index) to a previously created checkpoint.
 * Untracked files introduced after the checkpoint are removed via git clean.
 *
 * @param {string} cwdPath  Absolute path to the git repository
 * @param {string} ref      Checkpoint ID returned by createCheckpoint, e.g.
 *                          "cp-20260412T143022Z"
 * @returns {Promise<{ success: true }>}
 */
async function restoreCheckpoint(cwdPath, ref) {
  log("restoring checkpoint", ref, "in", cwdPath);
  const repoRoot = await resolveRepoRoot(cwdPath);
  log("resolved repo root:", repoRoot);

  const refName = `refs/claudi-checkpoints/${ref}`;

  // 1. Resolve the ref to a commit OID
  const resolveResult = await execGit(
    ["rev-parse", "--verify", refName],
    repoRoot
  );
  if (resolveResult.exitCode !== 0) {
    throw new Error(
      `[checkpoint] Cannot resolve ref ${refName}:\n${resolveResult.stderr}`
    );
  }
  const commitOid = resolveResult.stdout;
  log("resolved commit OID:", commitOid);

  // 2. Read the commit message to extract metadata
  const catResult = await execGit(
    ["cat-file", "commit", commitOid],
    repoRoot
  );
  if (catResult.exitCode !== 0) {
    throw new Error(
      `[checkpoint] git cat-file failed for ${commitOid}:\n${catResult.stderr}`
    );
  }

  const commitText = catResult.stdout;
  log("parsing metadata from commit message");

  // The commit message starts after the first blank line in the raw commit object
  const blankLineIdx = commitText.indexOf("\n\n");
  const messageBody =
    blankLineIdx !== -1 ? commitText.slice(blankLineIdx + 2) : commitText;

  function parseMeta(key) {
    const match = messageBody.match(new RegExp(`^${key} (.+)$`, "m"));
    return match ? match[1].trim() : null;
  }

  const headOid = parseMeta("head");
  const indexTree = parseMeta("index-tree");
  const worktreeTree = parseMeta("worktree-tree");

  if (!worktreeTree) {
    throw new Error(
      `[checkpoint] Metadata incomplete in checkpoint ${ref} — missing worktree-tree`
    );
  }

  log("metadata — head:", headOid, "index-tree:", indexTree, "worktree-tree:", worktreeTree);

  const zeros = "0000000000000000000000000000000000000000";

  // 3. Reset HEAD to the captured commit (if there was one)
  if (headOid && headOid !== zeros) {
    log("resetting HEAD to", headOid);
    const resetResult = await execGit(
      ["reset", "--hard", headOid],
      repoRoot
    );
    if (resetResult.exitCode !== 0) {
      throw new Error(
        `[checkpoint] git reset --hard failed:\n${resetResult.stderr}`
      );
    }
  }

  // 4. Restore the worktree from the captured tree object
  log("restoring worktree from tree", worktreeTree);
  const readTreeWtResult = await execGit(
    ["read-tree", "--reset", "-u", worktreeTree],
    repoRoot
  );
  if (readTreeWtResult.exitCode !== 0) {
    throw new Error(
      `[checkpoint] git read-tree --reset -u (worktree) failed:\n${readTreeWtResult.stderr}`
    );
  }

  // 5. Remove files that were untracked at snapshot time but exist now
  log("cleaning untracked files");
  const cleanResult = await execGit(["clean", "-fd"], repoRoot);
  if (cleanResult.exitCode !== 0) {
    // Non-fatal: log and continue
    log("warn: git clean -fd exited with", cleanResult.exitCode, cleanResult.stderr);
  }

  // 6. Restore the index to the captured index tree (if available)
  if (indexTree) {
    log("restoring index from tree", indexTree);
    const readTreeIdxResult = await execGit(
      ["read-tree", "--reset", indexTree],
      repoRoot
    );
    if (readTreeIdxResult.exitCode !== 0) {
      // Non-fatal: the worktree is already correct; log and continue
      log(
        "warn: git read-tree --reset (index) exited with",
        readTreeIdxResult.exitCode,
        readTreeIdxResult.stderr
      );
    }
  }

  log("checkpoint restored:", ref);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { createCheckpoint, restoreCheckpoint };
