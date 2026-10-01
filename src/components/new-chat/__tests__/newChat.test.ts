import { describe, expect, it } from "vitest";
import {
  filterBranches,
  filterIssues,
  findExactBranch,
  issueChipLabel,
  issueContextFor,
  makeWorktreeBranchName,
  newChatDraftScope,
  parseNewChatDraft,
  preferredBranch,
  resolveCreateRequest,
  type NewChatFormState,
} from "../newChat";

const base: NewChatFormState = {
  prompt: " fix it ",
  model: "opus",
  cwd: "/repo",
  branch: "",
  branchMode: null,
  worktree: false,
  worktreeName: "",
  currentBranch: "main",
  issueContext: null,
  attachments: [],
};

describe("resolveCreateRequest", () => {
  it("ignores empty prompts", () => {
    expect(resolveCreateRequest({ ...base, prompt: "  " })).toEqual({ kind: "empty" });
  });

  it("builds a plain request", () => {
    expect(resolveCreateRequest(base)).toEqual({
      kind: "ok",
      request: {
        cwd: "/repo", prompt: "fix it", model: "opus", branch: undefined, branchMode: "new", worktree: false,
        worktreeBaseBranch: undefined, issueContext: undefined, attachments: undefined,
      },
    });
  });

  it("requires a project for branches / worktrees", () => {
    expect(resolveCreateRequest({ ...base, cwd: null, branch: "feat" })).toEqual({
      kind: "error", key: "newChat.selectProjectBeforeBranchOrWorktree",
    });
    expect(resolveCreateRequest({ ...base, cwd: null, worktree: true }).kind).toBe("error");
  });

  it("creates a new worktree branch off the chosen or current branch", () => {
    const named = resolveCreateRequest({ ...base, worktree: true, worktreeName: " wt ", branch: "dev", branchMode: "existing" });
    expect(named).toMatchObject({ kind: "ok", request: { branch: "wt", branchMode: "new", worktree: true, worktreeBaseBranch: "dev" } });
    const random = resolveCreateRequest({ ...base, worktree: true }, "abc123");
    expect(random).toMatchObject({ request: { branch: "main-rayline-abc123", worktreeBaseBranch: "main" } });
    expect(resolveCreateRequest({ ...base, worktree: true, currentBranch: "" })).toEqual({ kind: "error", key: "newChat.pickBaseBranchFirst" });
  });

  it("keeps an existing branch and carries issue context and attachments", () => {
    const result = resolveCreateRequest({
      ...base, branch: "dev", branchMode: "existing", issueContext: "Issue #1: x", attachments: [{ type: "file", path: "/a" }],
    });
    expect(result).toMatchObject({ request: { branch: "dev", branchMode: "existing", issueContext: "Issue #1: x", attachments: [{ type: "file", path: "/a" }] } });
  });
});

describe("helpers", () => {
  it("names worktree branches", () => {
    expect(makeWorktreeBranchName(" feat ", "x1")).toBe("feat-rayline-x1");
    expect(makeWorktreeBranchName("", "x1")).toBe("rayline-rayline-x1");
  });

  it("filters issues and branches case-insensitively", () => {
    const issues = [{ number: 12, title: "Crash on start" }, { number: 3, title: "Docs" }];
    expect(filterIssues(issues, "CRASH").map((i) => i.number)).toEqual([12]);
    expect(filterIssues(issues, "#3").map((i) => i.number)).toEqual([3]);
    expect(filterBranches(["main", "Feature/x"], "feat")).toEqual(["Feature/x"]);
    expect(filterBranches(["main"], "")).toEqual(["main"]);
    expect(findExactBranch(["Main", "dev"], " main ")).toBe("Main");
    expect(findExactBranch(["dev"], "de")).toBeNull();
  });

  it("formats issue context and chip labels", () => {
    const ctx = issueContextFor({ number: 7, title: "Bug", body: null });
    expect(ctx).toBe("Issue #7: Bug\n\n");
    expect(issueChipLabel(ctx)).toBe("#7");
    expect(issueChipLabel(null)).toBeNull();
  });

  it("prefers the default branch when it exists", () => {
    expect(preferredBranch("dev", "main", ["main", "dev"])).toBe("dev");
    expect(preferredBranch("gone", "main", ["main"])).toBe("main");
    expect(preferredBranch(null, "", [])).toBe("");
  });
});

describe("drafts", () => {
  it("scopes drafts per default project", () => {
    expect(newChatDraftScope("/repo")).toBe("new-chat:/repo");
    expect(newChatDraftScope(null)).toBe("new-chat:drafts");
  });

  it("parses stored drafts defensively", () => {
    expect(parseNewChatDraft({})).toEqual({});
    expect(parseNewChatDraft({ text: "legacy" })).toEqual({ prompt: "legacy" });
    const parsed = parseNewChatDraft({
      prompt: "p", model: "opus", cwd: null, branch: "b", branchMode: "existing", worktree: true, worktreeName: "w",
      issueContext: "Issue #1: x", attachments: [{ type: "image", dataUrl: "data:x" }, { type: "image" }, { type: "file", path: "/f" }, 3],
    });
    expect(parsed).toEqual({
      prompt: "p", model: "opus", cwd: null, branch: "b", branchMode: "existing", worktree: true, worktreeName: "w",
      issueContext: "Issue #1: x", attachments: [{ type: "image", dataUrl: "data:x" }, { type: "file", path: "/f" }],
    });
    expect(parseNewChatDraft({ cwd: 5, branchMode: "weird", worktree: "yes" })).toEqual({});
  });
});
