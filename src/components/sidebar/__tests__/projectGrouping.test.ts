import { describe, expect, it } from "vitest";
import {
  applyCollapsedOverrides,
  formatCwdShort,
  getMainRepoRoot,
  getProjectDisplayName,
  groupConvosByProject,
  isDraftConversation,
  isProjectGroupListed,
  listPickerProjectRoots,
} from "../projectGrouping";
import type { SidebarConversation } from "../types";

function row(id: string, cwd: string | null | undefined, ts = 1): SidebarConversation {
  return { id, title: id, model: "sonnet", ts, cwd };
}

describe("getMainRepoRoot", () => {
  it("folds worktrees into their repo", () => {
    expect(getMainRepoRoot("/src/app/.worktrees/feat")).toBe("/src/app");
    expect(getMainRepoRoot("/src/app")).toBe("/src/app");
  });
});

describe("isDraftConversation", () => {
  it("treats missing cwd and the drafts folder (and its worktrees) as drafts", () => {
    expect(isDraftConversation(row("a", null), "/drafts")).toBe(true);
    expect(isDraftConversation(row("a", undefined), null)).toBe(true);
    expect(isDraftConversation(row("a", "/drafts/.worktrees/x"), "/drafts")).toBe(true);
    expect(isDraftConversation(row("a", "/repo"), "/drafts")).toBe(false);
    expect(isDraftConversation(row("a", "/repo"), null)).toBe(false);
  });
});

describe("groupConvosByProject", () => {
  it("groups by repo root, sorts by newest activity, and separates drafts", () => {
    const convos = [
      row("a", "/w/alpha", 10),
      row("b", "/w/beta/.worktrees/x", 30),
      row("c", null, 5),
      row("d", "/w/alpha", 20),
    ];
    const { projectGroups, drafts } = groupConvosByProject(convos, {}, null);
    expect(drafts.map((c) => c.id)).toEqual(["c"]);
    expect(projectGroups.map((g) => [g.cwdRoot, g.latestTs, g.convos.map((c) => c.id)])).toEqual([
      ["/w/beta", 30, ["b"]],
      ["/w/alpha", 20, ["a", "d"]],
    ]);
  });

  it("applies project metadata and adds empty manual projects", () => {
    const { projectGroups } = groupConvosByProject(
      [row("a", "/w/alpha", 10)],
      {
        "/w/alpha": { name: "Alpha", collapsed: true, context: "ctx" },
        "/w/manual": { manual: true, name: "ignored for empty groups", hidden: true },
        "/drafts": { manual: true },
      },
      "/drafts",
    );
    expect(projectGroups).toEqual([
      { cwdRoot: "/w/alpha", name: "Alpha", collapsed: true, hidden: false, context: "ctx", convos: [row("a", "/w/alpha", 10)], latestTs: 10 },
      { cwdRoot: "/w/manual", name: "manual", collapsed: false, hidden: true, context: "", convos: [], latestTs: null },
    ]);
  });

  it("disambiguates duplicate basenames with the parent folder", () => {
    const { projectGroups } = groupConvosByProject([row("a", "/one/app", 2), row("b", "/two/app", 1)], {}, null);
    expect(projectGroups.map((g) => g.name)).toEqual(["app (one)", "app (two)"]);
  });
});

describe("applyCollapsedOverrides", () => {
  it("keeps identity for untouched groups", () => {
    const { projectGroups } = groupConvosByProject([row("a", "/a", 2), row("b", "/b", 1)], {}, null);
    const next = applyCollapsedOverrides(projectGroups, { "/a": true, "/b": false });
    expect(next[0]).not.toBe(projectGroups[0]);
    expect(next[0]?.collapsed).toBe(true);
    expect(next[1]).toBe(projectGroups[1]);
  });
});

describe("isProjectGroupListed", () => {
  it("hides empty groups while searching and non-manual empty groups otherwise", () => {
    const empty = { cwdRoot: "/m", name: "m", collapsed: false, hidden: false, context: "", convos: [], latestTs: null };
    expect(isProjectGroupListed(empty, false, { "/m": { manual: true } })).toBe(true);
    expect(isProjectGroupListed(empty, true, { "/m": { manual: true } })).toBe(false);
    expect(isProjectGroupListed(empty, false, {})).toBe(false);
  });
});

describe("formatCwdShort", () => {
  it("shows repo / worktree inside a worktree, else the last two segments", () => {
    expect(formatCwdShort("/Users/me/code/app/.worktrees/feat")).toBe("app / feat");
    expect(formatCwdShort("/Users/me/code/app")).toBe("code/app");
    expect(formatCwdShort("C:\\code\\app")).toBe("code/app");
    expect(formatCwdShort(null)).toBeNull();
  });
});

describe("project picker helpers", () => {
  it("dedupes roots and hides hidden projects unless selected", () => {
    const meta = { "/a": { hidden: true }, "/b": { name: "Bee" } };
    expect(listPickerProjectRoots(["/a", "/b", "/b", "/c"], meta, null)).toEqual(["/b", "/c"]);
    expect(listPickerProjectRoots(["/a", "/b"], meta, "/a")).toEqual(["/a", "/b"]);
    expect(getProjectDisplayName("/b", meta)).toBe("Bee");
    expect(getProjectDisplayName("/x/c", meta)).toBe("c");
  });
});
