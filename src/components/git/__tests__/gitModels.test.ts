import { describe, expect, it } from "vitest";
import type { GitOpenPr, GitStatus, GitStatusFile } from "@shared/git/types";
import { createTranslator } from "../../../i18n";
import {
  buildWorktreePath,
  errorMessage,
  filterBranches,
  filterWorktrees,
  findMainWorktree,
  getWorktreeName,
  isBranchDeletable,
  listLinkedWorktrees,
} from "../branchModel";
import {
  deriveGitPillState,
  EMPTY_PR_INFO,
  fileCodeFor,
  getPillBadge,
  getPillTooltip,
  getPrButtonTitle,
  letterFor,
  splitStatusFiles,
  type PrInfo,
} from "../gitStatusModel";

const t = createTranslator("en-US");

describe("branchModel", () => {
  it("protects main/master and the current branch", () => {
    expect(isBranchDeletable("feature", "main")).toBe(true);
    expect(isBranchDeletable("main", "feature")).toBe(false);
    expect(isBranchDeletable("master", "feature")).toBe(false);
    expect(isBranchDeletable("feature", "feature")).toBe(false);
  });

  it("filters branches case-insensitively", () => {
    const branches = ["main", "Feature/Login", "fix-typo"];
    expect(filterBranches(branches, "  LOGIN ")).toEqual(["Feature/Login"]);
    expect(filterBranches(branches, "")).toBe(branches);
  });

  it("finds the main checkout and lists linked worktrees", () => {
    const worktrees = [
      { path: "/repo.git", bare: true as const },
      { path: "/repo", branch: "main" },
      { path: "/repo/.worktrees/a", branch: "feat-a" },
      { path: "/repo/.worktrees/b" },
    ];
    const main = findMainWorktree(worktrees);
    expect(main?.path).toBe("/repo");
    const linked = listLinkedWorktrees(worktrees, main);
    expect(linked.map((w) => w.path)).toEqual(["/repo/.worktrees/a", "/repo/.worktrees/b"]);
    expect(filterWorktrees(linked, "FEAT").map((w) => w.path)).toEqual(["/repo/.worktrees/a"]);
    expect(filterWorktrees(linked, "b").map((w) => w.path)).toEqual(["/repo/.worktrees/b"]);
    expect(getWorktreeName("/repo/.worktrees/b")).toBe("b");
  });

  it("builds worktree paths and error messages", () => {
    expect(buildWorktreePath("/repo/", "x")).toBe("/repo/.worktrees/x");
    expect(errorMessage(new Error("boom"))).toBe("boom");
    expect(errorMessage(new Error(""), "fallback")).toBe("fallback");
    expect(errorMessage({}, "fallback")).toBe("fallback");
  });
});

function file(path: string, index: string, worktree: string): GitStatusFile {
  return { path, index, worktree };
}

function status(extra: Partial<GitStatus> = {}): GitStatus {
  return { branch: "feat", upstream: "origin/feat", ahead: 0, behind: 0, files: [], detached: false, ...extra };
}

const openPr: GitOpenPr = {
  number: 7,
  title: "Feat",
  url: null,
  state: "OPEN",
  headRefName: "feat",
  baseRefName: "main",
  isDraft: false,
};

function derive(s: GitStatus, extra: { message?: string; busy?: boolean; prInfo?: PrInfo; defaultPrBranch?: string } = {}) {
  return deriveGitPillState(s, {
    message: extra.message ?? "",
    busy: extra.busy ?? false,
    defaultPrBranch: extra.defaultPrBranch,
    prInfo: extra.prInfo ?? EMPTY_PR_INFO,
  });
}

describe("gitStatusModel", () => {
  it("maps porcelain codes to letters", () => {
    expect(["?", "A", "D", "R", "M", "U", "T", "."].map(letterFor)).toEqual(["U", "A", "D", "R", "M", "M", "M", "M"]);
  });

  it("splits staged and unstaged files", () => {
    const files = [file("a", "M", "."), file("b", ".", "M"), file("c", "?", "?"), file("d", "A", "M")];
    const { staged, unstaged } = splitStatusFiles(files);
    expect(staged.map((f) => f.path)).toEqual(["a", "d"]);
    expect(unstaged.map((f) => f.path)).toEqual(["b", "c", "d"]);
    expect(fileCodeFor(files[2] as GitStatusFile, "unstaged")).toBe("?");
    expect(fileCodeFor(files[3] as GitStatusFile, "staged")).toBe("A");
  });

  it("gates commit / pull / publish / PR", () => {
    const dirty = status({ files: [file("a", ".", "M")], behind: 2 });
    expect(derive(dirty).canCommit).toBe(false);
    expect(derive(dirty, { message: "msg" }).canCommit).toBe(true);
    expect(derive(dirty, { message: "msg", busy: true }).canCommit).toBe(false);
    expect(derive(dirty).canPull).toBe(true);
    expect(derive(status({ upstream: null })).canPublish).toBe(true);
    expect(derive(status()).canPr).toBe(true);
    expect(derive(status({ branch: "main" })).canPr).toBe(false);
    expect(derive(status({ branch: "dev" }), { defaultPrBranch: " dev " }).canPr).toBe(false);
    expect(derive(status({ detached: true })).canPush).toBe(false);
  });

  it("tracks the open PR for the current branch only", () => {
    const withPr: PrInfo = { loading: false, checked: true, unavailable: false, openPr };
    expect(derive(status(), { prInfo: withPr }).openPr).toBe(openPr);
    expect(derive(status(), { prInfo: withPr }).canPr).toBe(false);
    expect(derive(status({ branch: "other" }), { prInfo: withPr }).openPr).toBeNull();
    const checking: PrInfo = { ...EMPTY_PR_INFO, loading: true };
    expect(derive(status(), { prInfo: checking }).isCheckingPr).toBe(true);
    expect(derive(status(), { prInfo: checking }).canPr).toBe(false);
  });

  it("titles the PR button by priority", () => {
    const state = derive(status());
    expect(getPrButtonTitle(state, { prSuccess: "Done", isCreatingPr: true }, t)).toBe("Done");
    expect(getPrButtonTitle(state, { prSuccess: "", isCreatingPr: true }, t)).toBe(t("git.status.creatingPr"));
    expect(getPrButtonTitle(state, { prSuccess: "", isCreatingPr: false }, t)).toBe(t("git.status.createPrTitle", { base: "main" }));
    const onBase = derive(status({ branch: "main" }));
    expect(getPrButtonTitle(onBase, { prSuccess: "", isCreatingPr: false }, t)).toBe(t("git.status.onBaseBranch", { base: "main" }));
  });

  it("summarizes the pill", () => {
    expect(getPillBadge(derive(status({ detached: true })))).toEqual({ kind: "detached" });
    expect(getPillBadge(derive(status({ upstream: null })))).toEqual({ kind: "local" });
    expect(getPillBadge(derive(status()))).toEqual({ kind: "clean" });
    expect(getPillBadge(derive(status({ ahead: 3, behind: 1 })))).toEqual({ kind: "changes", up: 3, down: 1 });
    expect(getPillBadge(derive(status({ ahead: 3, files: [file("a", "M", ".")] })))).toEqual({ kind: "changes", up: 1, down: null });
    expect(getPillTooltip(derive(status()), t)).toBe(t("git.status.cleanInSync"));
  });
});
