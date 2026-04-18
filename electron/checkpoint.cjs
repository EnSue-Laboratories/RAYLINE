"use strict";

const { execFile } = require("child_process");
const { randomBytes } = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);
const MAX_CAPTURED_UNTRACKED_FILE_BYTES = 512 * 1024;
const SKIPPED_UNTRACKED_DIR_NAMES = new Set([
  ".build",
  ".cache",
  ".claude",
  ".next",
  ".nuxt",
  ".perch",
  ".svelte-kit",
  ".turbo",
  "DerivedData",
  "Pods",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "release",
  "sessions",
]);
const SKIPPED_UNTRACKED_DIR_PREFIXES = [".codex", ".codex-source-packages"];
const CAPTURED_TEXT_BASENAMES = new Set([
  ".env",
  ".env.example",
  ".env.local",
  ".gitignore",
  ".npmrc",
  ".prettierignore",
  "AGENTS.md",
  "Brewfile",
  "CLAUDE.md",
  "Dockerfile",
  "Gemfile",
  "Makefile",
  "Podfile",
  "README",
  "README.md",
]);
const CAPTURED_TEXT_EXTENSIONS = new Set([
  ".bash",
  ".c",
  ".cc",
  ".cfg",
  ".conf",
  ".cpp",
  ".cs",
  ".css",
  ".cjs",
  ".go",
  ".graphql",
  ".h",
  ".hpp",
  ".html",
  ".ini",
  ".java",
  ".js",
  ".json",
  ".json5",
  ".jsonc",
  ".jsonl",
  ".jsx",
  ".kt",
  ".less",
  ".m",
  ".md",
  ".mdx",
  ".mm",
  ".mjs",
  ".php",
  ".plist",
  ".proto",
  ".py",
  ".rb",
  ".rs",
  ".sass",
  ".scss",
  ".sh",
  ".sql",
  ".strings",
  ".swift",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".xcconfig",
  ".xcstrings",
  ".xml",
  ".yaml",
  ".yml",
  ".zsh",
]);
const SKIPPED_BINARY_EXTENSIONS = new Set([
  ".7z",
  ".a",
  ".app",
  ".avi",
  ".bin",
  ".bmp",
  ".class",
  ".dmg",
  ".dylib",
  ".ear",
  ".eot",
  ".exe",
  ".gif",
  ".gz",
  ".heic",
  ".ico",
  ".jar",
  ".jpeg",
  ".jpg",
  ".m4a",
  ".mov",
  ".mp3",
  ".mp4",
  ".o",
  ".otf",
  ".pdf",
  ".png",
  ".pyc",
  ".so",
  ".svg",
  ".tar",
  ".tif",
  ".tiff",
  ".ttf",
  ".war",
  ".wav",
  ".webm",
  ".webp",
  ".woff",
  ".woff2",
  ".xz",
  ".zip",
]);

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function log(...args) {
  console.log("[checkpoint]", ...args);
}

function splitNullTerminated(stdout) {
  if (!stdout) return [];
  return stdout.split("\0").filter(Boolean);
}

function parseUntrackedPaths(stdout) {
  return splitNullTerminated(stdout)
    .filter((entry) => entry.startsWith("?? "))
    .map((entry) => entry.slice(3));
}

function encodeMetaJson(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

function decodeMetaJson(value) {
  try {
    return JSON.parse(Buffer.from(value, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function normalizeUntrackedPath(relPath) {
  return relPath.endsWith("/") ? relPath.slice(0, -1) : relPath;
}

function pathSegments(relPath) {
  return normalizeUntrackedPath(relPath).split("/").filter(Boolean);
}

function shouldSkipUntrackedDir(rootPath) {
  return pathSegments(rootPath).some(
    (segment) =>
      SKIPPED_UNTRACKED_DIR_NAMES.has(segment) ||
      SKIPPED_UNTRACKED_DIR_PREFIXES.some(
        (prefix) => segment === prefix || segment.startsWith(`${prefix}-`)
      )
  );
}

function looksLikeCapturedTextPath(relPath) {
  const normalizedPath = normalizeUntrackedPath(relPath);
  const baseName = path.basename(normalizedPath);
  if (CAPTURED_TEXT_BASENAMES.has(baseName)) return true;

  const extension = path.extname(baseName).toLowerCase();
  if (!extension) return false;
  if (SKIPPED_BINARY_EXTENSIONS.has(extension)) return false;
  return CAPTURED_TEXT_EXTENSIONS.has(extension);
}

function shouldCaptureUntrackedFile(repoRoot, relPath) {
  const normalizedPath = normalizeUntrackedPath(relPath);
  if (shouldSkipUntrackedDir(path.dirname(normalizedPath))) return false;
  if (!looksLikeCapturedTextPath(normalizedPath)) return false;

  try {
    const fileStat = fs.statSync(path.join(repoRoot, normalizedPath));
    return fileStat.isFile() && fileStat.size <= MAX_CAPTURED_UNTRACKED_FILE_BYTES;
  } catch {
    return false;
  }
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
      ["commit", "--allow-empty", "-m", "rayline: initial checkpoint"],
      cwdPath,
      {
        GIT_AUTHOR_NAME: "RayLine",
        GIT_AUTHOR_EMAIL: "rayline@noreply",
        GIT_COMMITTER_NAME: "RayLine",
        GIT_COMMITTER_EMAIL: "rayline@noreply",
      }
    );
    log("Git repo initialized:", cwdPath);
    return cwdPath;
  }
  return repoRootResult.stdout;
}

async function listCurrentUntrackedRoots(repoRoot) {
  const untrackedResult = await execGit(
    ["status", "--porcelain=v1", "-z", "--untracked-files=normal"],
    repoRoot
  );
  if (untrackedResult.exitCode !== 0) {
    throw new Error(
      `[checkpoint] git status --untracked-files=normal failed:\n${untrackedResult.stderr}`
    );
  }
  return parseUntrackedPaths(untrackedResult.stdout);
}

async function inspectWorktreeState(repoRoot) {
  const [trackedDeltaResult, untrackedAllResult, untrackedNormalResult] = await Promise.all([
    execGit(["diff-files", "--name-only", "-z"], repoRoot),
    execGit(["status", "--porcelain=v1", "-z", "--untracked-files=all"], repoRoot),
    execGit(["status", "--porcelain=v1", "-z", "--untracked-files=normal"], repoRoot),
  ]);

  if (trackedDeltaResult.exitCode !== 0) {
    throw new Error(
      `[checkpoint] git diff-files failed:\n${trackedDeltaResult.stderr}`
    );
  }

  if (untrackedAllResult.exitCode !== 0) {
    throw new Error(
      `[checkpoint] git status --untracked-files=all failed:\n${untrackedAllResult.stderr}`
    );
  }

  if (untrackedNormalResult.exitCode !== 0) {
    throw new Error(
      `[checkpoint] git status --untracked-files=normal failed:\n${untrackedNormalResult.stderr}`
    );
  }

  const trackedDeltaPaths = splitNullTerminated(trackedDeltaResult.stdout);
  const untrackedAllPaths = parseUntrackedPaths(untrackedAllResult.stdout);
  const untrackedRoots = parseUntrackedPaths(untrackedNormalResult.stdout);

  const captureUntrackedPaths = [];
  const cleanableUntrackedDirRoots = [];
  const skippedUntrackedRoots = [];

  for (const root of untrackedRoots) {
    const normalizedRoot = normalizeUntrackedPath(root);
    let stat;
    try {
      stat = fs.statSync(path.join(repoRoot, normalizedRoot));
    } catch {
      continue;
    }

    if (!stat.isDirectory()) {
      if (shouldCaptureUntrackedFile(repoRoot, normalizedRoot)) {
        captureUntrackedPaths.push(normalizedRoot);
      } else {
        skippedUntrackedRoots.push(root);
      }
      continue;
    }

    if (shouldSkipUntrackedDir(root)) {
      skippedUntrackedRoots.push(root);
      continue;
    }

    const dirPaths = untrackedAllPaths.filter((candidate) => candidate.startsWith(root));
    if (
      dirPaths.length > 0 &&
      dirPaths.every((candidate) => shouldCaptureUntrackedFile(repoRoot, candidate))
    ) {
      captureUntrackedPaths.push(...dirPaths.map((candidate) => normalizeUntrackedPath(candidate)));
      cleanableUntrackedDirRoots.push(root);
    } else {
      skippedUntrackedRoots.push(root);
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

async function buildWorktreeTree(repoRoot, indexTree, capturePaths) {
  log("worktree delta paths:", capturePaths.length);

  if (capturePaths.length === 0) {
    log("no captured worktree paths; reusing index tree for checkpoint snapshot");
    return indexTree;
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "claudi-cp-"));
  const tempIndex = path.join(tempDir, "index");
  const pathspecFile = path.join(tempDir, "paths");

  try {
    log("building worktree tree with temp index:", tempIndex);

    const readTreeResult = await execGit(["read-tree", indexTree], repoRoot, {
      GIT_INDEX_FILE: tempIndex,
    });
    if (readTreeResult.exitCode !== 0) {
      throw new Error(
        `[checkpoint] git read-tree (temp index) failed:\n${readTreeResult.stderr}`
      );
    }

    fs.writeFileSync(pathspecFile, Buffer.from(`${capturePaths.join("\0")}\0`));

    const addResult = await execGit(
      ["add", "-A", `--pathspec-from-file=${pathspecFile}`, "--pathspec-file-nul"],
      repoRoot,
      { GIT_INDEX_FILE: tempIndex }
    );
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

    return worktreeTreeResult.stdout;
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (cleanupErr) {
      log("warn: failed to clean up temp dir:", tempDir, cleanupErr.message);
    }
  }
}

// ---------------------------------------------------------------------------
// createCheckpoint
// ---------------------------------------------------------------------------

/**
 * Snapshot the current working state (HEAD + index + worktree) as a git ref
 * under refs/claudi-checkpoints/. The user's real staging area is never
 * modified — the worktree tree is built through a throwaway temp index that
 * only refreshes paths that differ from the current index. Untracked content
 * is captured only when it looks like small source/text content; generated,
 * binary, and mixed-content roots are preserved instead of restaged.
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

  // 5. Inspect worktree changes and capture a targeted temp-index snapshot
  const worktreeState = await inspectWorktreeState(repoRoot);
  log(
    "untracked roots:",
    worktreeState.untrackedRoots.length,
    "exact paths:",
    worktreeState.exactUntrackedPathCount,
    "skipped roots:",
    worktreeState.skippedUntrackedRoots.length
  );
  if (worktreeState.skippedUntrackedRoots.length > 0) {
    log("skipping non-source untracked roots:", worktreeState.skippedUntrackedRoots.join(", "));
  }

  const worktreeTree = await buildWorktreeTree(
    repoRoot,
    indexTree,
    worktreeState.capturePaths
  );
  log("worktree tree:", worktreeTree);

  // 6. Compose the metadata commit message
  const createdAt = now.toISOString();
  const commitMessage = [
    `checkpoint:${id}`,
    `head ${headOid}`,
    `index-tree ${indexTree}`,
    `worktree-tree ${worktreeTree}`,
    `created ${createdAt}`,
  ];
  if (worktreeState.untrackedRoots.length > 0) {
    commitMessage.push(
      `untracked-roots-json ${encodeMetaJson(worktreeState.untrackedRoots)}`
    );
  }
  if (worktreeState.cleanableUntrackedDirRoots.length > 0) {
    commitMessage.push(
      `cleanable-untracked-dirs-json ${encodeMetaJson(
        worktreeState.cleanableUntrackedDirRoots
      )}`
    );
  }

  // 7. Create the commit object (Inspector-style author env vars)
  const authorEnv = {
    GIT_AUTHOR_NAME: "RayLine Checkpoint",
    GIT_AUTHOR_EMAIL: "checkpoint@rayline.local",
    GIT_COMMITTER_NAME: "RayLine Checkpoint",
    GIT_COMMITTER_EMAIL: "checkpoint@rayline.local",
  };

  const commitTreeArgs = ["commit-tree", worktreeTree, "-m", commitMessage.join("\n")];
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
 * Untracked files introduced after the checkpoint are removed selectively so
 * pre-existing skipped roots can be preserved without exact restaging on every
 * checkpoint.
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
  const untrackedRoots = decodeMetaJson(parseMeta("untracked-roots-json") || "") || [];
  const cleanableUntrackedDirRoots =
    decodeMetaJson(parseMeta("cleanable-untracked-dirs-json") || "") || [];

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

  // 5. Remove untracked roots that were introduced after the checkpoint.
  // For small captured directories, git clean can safely remove extra files
  // while preserving snapshot files because they are still tracked in the
  // temporary worktree tree at this point.
  const currentUntrackedRoots = await listCurrentUntrackedRoots(repoRoot);
  const preservedRootSet = new Set(untrackedRoots);
  const cleanableDirRootSet = new Set(cleanableUntrackedDirRoots);
  log("cleaning untracked roots:", currentUntrackedRoots.length);

  for (const root of currentUntrackedRoots) {
    if (cleanableDirRootSet.has(root)) {
      const cleanResult = await execGit(["clean", "-fd", "--", root], repoRoot);
      if (cleanResult.exitCode !== 0) {
        log(
          "warn: git clean -fd failed for preserved dir",
          root,
          cleanResult.exitCode,
          cleanResult.stderr
        );
      }
      continue;
    }

    if (preservedRootSet.has(root)) continue;

    try {
      fs.rmSync(path.join(repoRoot, root), { recursive: true, force: true });
    } catch (removeErr) {
      log("warn: failed to remove untracked root:", root, removeErr.message);
    }
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
