import { describe, expect, it } from "vitest";
import {
  anchorDropdown,
  getBranchMenuPosition,
  getProjectMenuPosition,
  getProjectPickerPosition,
} from "../dropdownPosition";
import {
  areConversationRowsEqual,
  areProjectGroupsEqual,
  sameConversationData,
  type ProjectGroupCompareProps,
} from "../projectGroupEquality";
import { deriveRepoDirName, joinClonePath } from "../projectPaths";
import { createArrayStabilizer, createSearchPreviewDecorator } from "../rowStability";
import type { ProjectGroupData, SidebarConversation } from "../types";
import { computeVirtualWindow, getConversationRowHeight } from "../virtualWindow";

const rowA: SidebarConversation = { id: "a", title: "A", model: "m", ts: 1, lastPreview: "p" };
const rowB: SidebarConversation = { id: "b", title: "B", model: "m", ts: 2 };

describe("createArrayStabilizer", () => {
  it("returns the previous array while items are identical", () => {
    const stabilize = createArrayStabilizer<SidebarConversation>();
    const first = stabilize([rowA, rowB]);
    expect(stabilize([rowA, rowB])).toBe(first);
    const changed = stabilize([rowA, { ...rowB }]);
    expect(changed).not.toBe(first);
    expect(stabilize([rowA])).not.toBe(changed);
  });
});

describe("createSearchPreviewDecorator", () => {
  it("reuses decorated rows until the row or preview changes", () => {
    const decorate = createSearchPreviewDecorator();
    const first = decorate(rowA, "hit");
    expect(first).toEqual({ ...rowA, _searchPreview: "hit" });
    expect(decorate(rowA, "hit")).toBe(first);
    expect(decorate(rowA, null)).not.toBe(first);
  });
});

function group(convos: SidebarConversation[], extra: Partial<ProjectGroupData> = {}): ProjectGroupData {
  return { cwdRoot: "/p", name: "p", collapsed: false, hidden: false, context: "", convos, latestTs: 2, ...extra };
}

const NO_MODELS: ProjectGroupCompareProps["multicaModels"] = [];

function groupProps(project: ProjectGroupData, active: string | null, extra: Partial<ProjectGroupCompareProps> = {}): ProjectGroupCompareProps {
  return {
    project,
    active,
    searchActive: false,
    multicaModels: NO_MODELS,
    locale: "en-US",
    onSelect: null,
    onDelete: null,
    onNewInProject: null,
    onToggleCollapse: null,
    onHideProject: null,
    onEditContext: null,
    ...extra,
  };
}

describe("areProjectGroupsEqual", () => {
  const models: ProjectGroupCompareProps["multicaModels"] = [];

  it("ignores new row objects with the same rendered data", () => {
    const prev = groupProps(group([rowA, rowB]), null, { multicaModels: models });
    const next = groupProps(group([{ ...rowA, ts: 99 }, rowB]), null, { multicaModels: models });
    expect(areProjectGroupsEqual(prev, next)).toBe(true);
  });

  it("re-renders on preview, streaming, callback or locale changes", () => {
    const prev = groupProps(group([rowA]), null, { multicaModels: models });
    expect(areProjectGroupsEqual(prev, groupProps(group([{ ...rowA, lastPreview: "q" }]), null, { multicaModels: models }))).toBe(false);
    expect(areProjectGroupsEqual(prev, groupProps(group([{ ...rowA, isStreaming: true }]), null, { multicaModels: models }))).toBe(false);
    expect(areProjectGroupsEqual(prev, { ...prev, onSelect: () => undefined })).toBe(false);
    expect(areProjectGroupsEqual(prev, { ...prev, locale: "zh-CN" })).toBe(false);
  });

  it("only cares about active changes that touch its own rows", () => {
    const project = group([rowA]);
    expect(areProjectGroupsEqual(groupProps(project, "x"), groupProps(project, "y"))).toBe(true);
    expect(areProjectGroupsEqual(groupProps(project, "x"), groupProps(project, "a"))).toBe(false);
  });
});

describe("row comparators", () => {
  it("compares rendered fields and tags", () => {
    expect(sameConversationData(rowA, { ...rowA })).toBe(true);
    expect(sameConversationData({ ...rowA, tags: ["x"] }, { ...rowA, tags: ["x"] })).toBe(true);
    expect(sameConversationData({ ...rowA, tags: ["x"] }, { ...rowA, tags: ["y"] })).toBe(false);
    const props = { conversation: rowA, isActive: false, multicaModels: [], rowHeight: 76, top: 0, onSelect: null, onDelete: null, s: null };
    expect(areConversationRowsEqual(props, { ...props, conversation: { ...rowA } })).toBe(true);
    expect(areConversationRowsEqual(props, { ...props, top: 76 })).toBe(false);
    expect(areConversationRowsEqual(props, { ...props, isActive: true })).toBe(false);
  });
});

describe("computeVirtualWindow", () => {
  it("windows with overscan and clamps the scroll offset", () => {
    expect(computeVirtualWindow(20, 76, 0)).toEqual({ viewportHeight: 320, totalHeight: 1520, startIndex: 0, endIndex: 8 });
    expect(computeVirtualWindow(20, 76, 760)).toEqual({ viewportHeight: 320, totalHeight: 1520, startIndex: 7, endIndex: 18 });
    expect(computeVirtualWindow(20, 76, 99999).endIndex).toBe(20);
    expect(getConversationRowHeight(60)).toBe(76);
    expect(getConversationRowHeight(90.2)).toBe(91);
  });
});

describe("dropdown positions", () => {
  const anchor = { top: 100, bottom: 120, left: 50, right: 150, width: 100 };

  it("left-aligns, or right-aligns near the right edge", () => {
    expect(anchorDropdown(anchor, 200, { width: 1000 })).toEqual({ top: 126, left: 50, width: 200 });
    expect(anchorDropdown({ ...anchor, left: 900, right: 990 }, 200, { width: 1000 })).toEqual({ top: 126, left: 790, width: 200 });
    expect(getBranchMenuPosition(anchor, { width: 1000 }).width).toBe(240);
  });

  it("clamps the project menu into the viewport", () => {
    expect(getProjectMenuPosition(anchor, { width: 1000, height: 800 })).toEqual({ top: 124, left: 50 });
    expect(getProjectMenuPosition({ ...anchor, bottom: 790, left: 990 }, { width: 1000, height: 800 })).toEqual({ top: 620, left: 804 });
  });

  it("flips the project picker above when there is no room below", () => {
    const below = getProjectPickerPosition(anchor, { width: 1000, height: 800 });
    expect(below).toEqual({ top: 126, left: 8, width: 240, maxHeight: 360 });
    const above = getProjectPickerPosition({ ...anchor, top: 700, bottom: 720 }, { width: 1000, height: 800 });
    expect(above.top).toBe(700 - 6 - 360);
  });
});

describe("project paths", () => {
  it("derives the clone folder name", () => {
    expect(deriveRepoDirName("https://github.com/owner/repo.git")).toBe("repo");
    expect(deriveRepoDirName("git@github.com:owner/repo/")).toBe("repo");
    expect(deriveRepoDirName("owner/repo")).toBe("repo");
    expect(deriveRepoDirName("   ")).toBeNull();
    expect(joinClonePath("/home/me/", "repo")).toBe("/home/me/repo");
  });
});
