import { describe, expect, it } from "vitest";
import {
  appendGitignoreEntry,
  deriveRepoDirName,
  extractPrNumber,
  normalizeCloneUrl,
  normalizeOpenPr,
  parseBranchList,
  parseGithubRemoteSlug,
  parseStatusPorcelainV2,
  parseWorktreeList,
  toGhOwnerRepo,
  withCoauthorTrailer,
} from "./git-parse";

describe("git output parsers", () => {
  it("parses branches", () => {
    expect(parseBranchList("main\t*\nfeature\t \n")).toEqual({ current: "main", branches: ["main", "feature"] });
  });

  it("parses worktrees", () => {
    const raw = "worktree /repo\nHEAD abc\nbranch refs/heads/main\n\nworktree /repo/.worktrees/x\nHEAD def\ndetached\n\nworktree /bare\nbare";
    expect(parseWorktreeList(raw)).toEqual([
      { path: "/repo", head: "abc", branch: "main" },
      { path: "/repo/.worktrees/x", head: "def" },
      { path: "/bare", bare: true },
    ]);
  });

  it("parses porcelain v2 status", () => {
    const raw = [
      "# branch.oid abc",
      "# branch.head feature",
      "# branch.upstream origin/feature",
      "# branch.ab +2 -1",
      "1 .M N... 100644 100644 100644 a b src/a file.ts",
      "2 R. N... 100644 100644 100644 a b R100 new name.ts\told.ts",
      "u UU N... 100644 100644 100644 100644 a b c conflict.ts",
      "? untracked.txt",
      "! ignored.txt",
    ].join("\n");
    expect(parseStatusPorcelainV2(raw)).toEqual({
      branch: "feature",
      upstream: "origin/feature",
      ahead: 2,
      behind: 1,
      detached: false,
      files: [
        { path: "src/a file.ts", index: ".", worktree: "M" },
        { path: "new name.ts", index: "R", worktree: "." },
        { path: "conflict.ts", index: "U", worktree: "U" },
        { path: "untracked.txt", index: "?", worktree: "?" },
      ],
    });
    expect(parseStatusPorcelainV2("# branch.head (detached)").detached).toBe(true);
  });

  it("parses GitHub remotes and PR numbers", () => {
    expect(parseGithubRemoteSlug("git@github.com:owner/repo.git")).toBe("owner/repo");
    expect(parseGithubRemoteSlug("https://github.com/owner/repo")).toBe("owner/repo");
    expect(parseGithubRemoteSlug("https://gitlab.com/owner/repo")).toBeNull();
    expect(extractPrNumber("https://github.com/o/r/pull/42")).toBe(42);
    expect(extractPrNumber(null)).toBeNull();
  });

  it("normalizes open PRs from REST and gh shapes", () => {
    expect(normalizeOpenPr({ number: 1, title: "t", html_url: "u", state: "open", head: { ref: "h" }, base: { ref: "b" }, draft: true }))
      .toEqual({ number: 1, title: "t", url: "u", state: "OPEN", headRefName: "h", baseRefName: "b", isDraft: true });
    expect(normalizeOpenPr(null)).toBeNull();
  });
});

describe("git helpers", () => {
  it("appends co-author trailers once", () => {
    expect(withCoauthorTrailer("feat: x\n", "Co-Authored-By: A <a@b>")).toBe("feat: x\n\nCo-Authored-By: A <a@b>\n");
    expect(withCoauthorTrailer("feat: x\n\nCo-Authored-By: A <a@b>", "Co-Authored-By: A <a@b>")).toBe("feat: x\n\nCo-Authored-By: A <a@b>");
    expect(withCoauthorTrailer("m", undefined)).toBe("m");
  });

  it("appends .gitignore entries", () => {
    expect(appendGitignoreEntry("node_modules", "dist/")).toBe("node_modules\ndist\n");
    expect(appendGitignoreEntry("dist/\n", "dist")).toBeNull();
  });

  it("derives clone targets", () => {
    expect(normalizeCloneUrl(" https://github.com/o/r/ ")).toBe("https://github.com/o/r");
    expect(toGhOwnerRepo("https://github.com/o/r.git")).toBe("o/r");
    expect(toGhOwnerRepo("o/r")).toBe("o/r");
    expect(toGhOwnerRepo("git@gitlab.com:o/r.git")).toBeNull();
    expect(deriveRepoDirName("git@github.com:o/repo.git")).toBe("repo");
  });
});
