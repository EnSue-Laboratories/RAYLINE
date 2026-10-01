import { describe, expect, it } from "vitest";
import {
  buildProjectChooserProjects,
  collectCwdRoots,
  getEffectiveConversationCwd,
  getProjectChooserSignature,
  normalizeConversationCreationCwd,
  normalizeProjectsMeta,
  resolveNewChatDefaultCwd,
} from "../conversation/paths";

const DRAFTS = "/home/u/Drafts";

describe("conversation paths", () => {
  it("effective cwd: null = drafts, undefined = app cwd", () => {
    expect(getEffectiveConversationCwd({ cwd: null as unknown as undefined }, "/app", DRAFTS)).toBe(DRAFTS);
    expect(getEffectiveConversationCwd({}, "/app", DRAFTS)).toBe("/app");
    expect(getEffectiveConversationCwd({ cwd: "/repo" }, "/app", DRAFTS)).toBe("/repo");
  });

  it("creation cwd maps worktrees to roots and drafts to undefined", () => {
    expect(normalizeConversationCreationCwd("/repo/.worktrees/feat", DRAFTS)).toBe("/repo");
    expect(normalizeConversationCreationCwd(DRAFTS, DRAFTS)).toBeUndefined();
    expect(normalizeConversationCreationCwd(null, DRAFTS)).toBeNull();
  });

  it("merges worktree project entries into their roots", () => {
    const result = normalizeProjectsMeta({
      "/repo/.worktrees/x": { name: "x", manual: true },
      "/repo": { name: "Repo", hidden: true },
    });
    expect(result).toEqual({ "/repo": { name: "Repo", hidden: true, manual: true } });
  });

  it("chooser projects only change with name/hidden/manual", () => {
    const a = { "/r": { name: "R", context: "one" } };
    const b = { "/r": { name: "R", context: "two", collapsed: true } };
    expect(getProjectChooserSignature(a)).toBe(getProjectChooserSignature(b));
    expect(buildProjectChooserProjects(a)).toEqual({ "/r": { name: "R" } });
  });

  it("collects project roots without drafts or worktrees", () => {
    const roots = collectCwdRoots([{ cwd: "/a/.worktrees/b" }, { cwd: DRAFTS }, {}], { "/c": {} }, DRAFTS);
    expect(roots).toEqual(["/a", "/c"]);
  });

  it("new-chat default: explicit project, active, app cwd, then first project", () => {
    const base = { activeCwd: undefined, appCwd: null, convos: [{ cwd: "/x/.worktrees/y" }], draftsPath: DRAFTS };
    expect(resolveNewChatDefaultCwd({ ...base, explicitProject: null })).toBeNull();
    expect(resolveNewChatDefaultCwd({ ...base, explicitProject: "/p" })).toBe("/p");
    expect(resolveNewChatDefaultCwd({ ...base, explicitProject: undefined, activeCwd: "/act" })).toBe("/act");
    expect(resolveNewChatDefaultCwd({ ...base, explicitProject: undefined, appCwd: DRAFTS })).toBe("/x");
  });
});
