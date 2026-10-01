import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCheckpoint, restoreCheckpoint } from "../checkpoints";
import { checkpointId, composeCheckpointMessage, parseCheckpointCommit } from "../metadata";
import { isCaptureCandidate, parseUntrackedPaths, shouldSkipUntrackedDir } from "../paths";

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@t",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@t",
};

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, env: GIT_ENV, encoding: "utf8" }).trim();
}

describe("checkpoint metadata", () => {
  it("formats ids and round-trips the commit message", () => {
    expect(checkpointId(new Date(Date.UTC(2026, 3, 12, 14, 30, 22, 7)), "a1b2c3")).toBe("cp-20260412T143022007Z-a1b2c3");
    const message = composeCheckpointMessage({
      id: "cp-x",
      headOid: "h",
      indexTree: "i",
      worktreeTree: "w",
      createdAt: "2026-01-01T00:00:00.000Z",
      untrackedRoots: ["new/", "a.txt"],
      cleanableUntrackedDirRoots: ["new/"],
    });
    expect(parseCheckpointCommit(`tree w\nauthor x\n\n${message}\n`)).toEqual({
      headOid: "h",
      indexTree: "i",
      worktreeTree: "w",
      untrackedRoots: ["new/", "a.txt"],
      cleanableUntrackedDirRoots: ["new/"],
    });
  });

  it("classifies capture candidates", () => {
    expect(parseUntrackedPaths("?? a.ts\0 M b.ts\0?? dir/\0")).toEqual(["a.ts", "dir/"]);
    expect(isCaptureCandidate("src/a.ts")).toBe(true);
    expect(isCaptureCandidate("logo.png")).toBe(false);
    expect(isCaptureCandidate("node_modules/x/index.js")).toBe(false);
    expect(isCaptureCandidate("Makefile")).toBe(true);
    expect(shouldSkipUntrackedDir(".codex-foo/")).toBe(true);
  });
});

describe("createCheckpoint / restoreCheckpoint", () => {
  let repo: string;

  beforeEach(async () => {
    repo = await realpath(await mkdtemp(path.join(tmpdir(), "rl-checkpoint-")));
    git(repo, "init", "-q");
    await writeFile(path.join(repo, "tracked.ts"), "export const v = 1;\n");
    await writeFile(path.join(repo, "staged.ts"), "base\n");
    git(repo, "add", ".");
    git(repo, "commit", "-q", "-m", "init");
  });

  afterEach(async () => {
    await rm(repo, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });

  it("restores tracked edits, captured untracked files and the index", async () => {
    await writeFile(path.join(repo, "tracked.ts"), "export const v = 2;\n");
    await writeFile(path.join(repo, "staged.ts"), "staged change\n");
    git(repo, "add", "staged.ts");
    await writeFile(path.join(repo, "notes.md"), "keep me\n");
    await mkdir(path.join(repo, "feature"));
    await writeFile(path.join(repo, "feature", "a.ts"), "a\n");
    await mkdir(path.join(repo, "node_modules", "dep"), { recursive: true });
    await writeFile(path.join(repo, "node_modules", "dep", "index.js"), "dep\n");
    const statusBefore = git(repo, "status", "--porcelain");

    const { ref } = await createCheckpoint(repo);
    expect(ref).toMatch(/^cp-\d{8}T\d{9}Z-[0-9a-f]{6}$/);
    // The real index is untouched by creating a checkpoint.
    expect(git(repo, "status", "--porcelain")).toBe(statusBefore);
    expect(git(repo, "for-each-ref", "--format=%(refname)", "refs/claudi-checkpoints/")).toBe(`refs/claudi-checkpoints/${ref}`);

    // Mess everything up.
    await writeFile(path.join(repo, "tracked.ts"), "broken\n");
    git(repo, "reset", "-q");
    await rm(path.join(repo, "notes.md"));
    await writeFile(path.join(repo, "feature", "extra.ts"), "extra\n");
    await writeFile(path.join(repo, "stray.txt"), "new after checkpoint\n");

    await expect(restoreCheckpoint(repo, ref)).resolves.toEqual({ success: true });

    expect(await readFile(path.join(repo, "tracked.ts"), "utf8")).toBe("export const v = 2;\n");
    expect(await readFile(path.join(repo, "notes.md"), "utf8")).toBe("keep me\n");
    expect(existsSync(path.join(repo, "feature", "a.ts"))).toBe(true);
    expect(existsSync(path.join(repo, "feature", "extra.ts"))).toBe(false);
    expect(existsSync(path.join(repo, "stray.txt"))).toBe(false);
    // Preserved (not captured) root survives untouched.
    expect(existsSync(path.join(repo, "node_modules", "dep", "index.js"))).toBe(true);
    expect(git(repo, "status", "--porcelain")).toBe(statusBefore);
  });

  it("initializes a repo when the folder is not one, and rejects unknown refs", async () => {
    const plain = await realpath(await mkdtemp(path.join(tmpdir(), "rl-checkpoint-plain-")));
    try {
      await writeFile(path.join(plain, "a.txt"), "x\n");
      const { ref } = await createCheckpoint(plain);
      expect(existsSync(path.join(plain, ".git"))).toBe(true);
      await expect(restoreCheckpoint(plain, ref)).resolves.toEqual({ success: true });
      await expect(restoreCheckpoint(plain, "cp-missing")).rejects.toThrow(/Cannot resolve ref/);
    } finally {
      await rm(plain, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  });
});
