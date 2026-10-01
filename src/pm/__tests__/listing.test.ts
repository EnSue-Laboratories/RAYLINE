import { describe, expect, it } from "vitest";
import {
  filterByQuery,
  freshItemMatchesScope,
  insertFreshItem,
  isSameItemList,
  mergeFetchedItems,
  sortByUpdatedDesc,
} from "../listing";
import type { ListItemCore } from "../types";
import { isGitHubOpen, normalizeGitHubState } from "../../pm-components/githubState";

const item = (repo: string, number: number, updated: string, extra: Partial<ListItemCore> = {}): ListItemCore => ({
  _repo: repo,
  number,
  title: `#${number}`,
  state: "open",
  updated_at: updated,
  user: { login: "me" },
  ...extra,
});

describe("sortByUpdatedDesc", () => {
  it("sorts newest first without mutating the input", () => {
    const input = [item("o/a", 1, "2026-01-01"), item("o/a", 2, "2026-03-01")];
    expect(sortByUpdatedDesc(input).map((i) => i.number)).toEqual([2, 1]);
    expect(input[0]?.number).toBe(1);
  });
});

describe("mergeFetchedItems", () => {
  it("keeps optimistic rows the server hasn't returned yet", () => {
    const optimistic = item("o/a", 9, "2026-05-01", { __optimistic: true });
    const merged = mergeFetchedItems([optimistic], [item("o/a", 1, "2026-01-01")]);
    expect(merged.map((i) => i.number)).toEqual([9, 1]);
  });

  it("drops optimistic rows once the server lists them", () => {
    const optimistic = item("o/a", 9, "2026-05-01", { __optimistic: true });
    const merged = mergeFetchedItems([optimistic], [item("o/a", 9, "2026-05-02")]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.__optimistic).toBeUndefined();
  });

  it("returns the previous array when a poll brings no change", () => {
    const prev = [item("o/a", 2, "2026-03-01"), item("o/a", 1, "2026-01-01")];
    const fetched = [item("o/a", 1, "2026-01-01"), item("o/a", 2, "2026-03-01")];
    expect(mergeFetchedItems(prev, fetched)).toBe(prev);
  });

  it("detects changed timestamps", () => {
    const prev = [item("o/a", 1, "2026-01-01")];
    expect(isSameItemList(prev, [item("o/a", 1, "2026-01-02")])).toBe(false);
  });
});

describe("fresh items", () => {
  const scope = { stateFilter: "open" as const, repoFilter: null, repos: ["o/a"] };

  it("matches only when state, repo filter and repo list agree", () => {
    expect(freshItemMatchesScope({ ...item("o/a", 3, "2026-01-01") }, scope)).toBe(true);
    expect(freshItemMatchesScope({ ...item("o/a", 3, "2026-01-01"), number: null }, scope)).toBe(false);
    expect(freshItemMatchesScope(item("o/a", 3, "2026-01-01", { state: "closed" }), scope)).toBe(false);
    expect(freshItemMatchesScope(item("o/b", 3, "2026-01-01"), scope)).toBe(false);
    expect(freshItemMatchesScope(item("o/a", 3, "2026-01-01"), { ...scope, repoFilter: "o/c" })).toBe(false);
  });

  it("prepends once as optimistic", () => {
    const prev = [item("o/a", 1, "2026-01-01")];
    const once = insertFreshItem(prev, item("o/a", 3, "2026-01-02"));
    expect(once.map((i) => [i.number, i.__optimistic])).toEqual([[3, true], [1, undefined]]);
    expect(insertFreshItem(once, item("o/a", 3, "2026-01-02"))).toBe(once);
  });
});

describe("filterByQuery", () => {
  it("filters case-insensitively and passes through empty queries", () => {
    const names = ["main", "Feature/X", "fix"];
    expect(filterByQuery(names, "", (n) => n)).toBe(names);
    expect(filterByQuery(names, "f", (n) => n)).toEqual(["Feature/X", "fix"]);
  });
});

describe("githubState", () => {
  it("normalizes casing and falls back", () => {
    expect(normalizeGitHubState(" OPEN ")).toBe("open");
    expect(normalizeGitHubState("merged", "closed")).toBe("closed");
    expect(isGitHubOpen(undefined)).toBe(true);
    expect(isGitHubOpen("closed")).toBe(false);
  });
});
