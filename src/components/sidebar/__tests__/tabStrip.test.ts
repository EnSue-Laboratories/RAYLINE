import { describe, expect, it } from "vitest";
import { areTabStripPropsEqual, getTabSlotStyle, sameTabs, type TabStripTab } from "../tabStrip";

const tabs: TabStripTab[] = [
  { id: "a", title: "A", state: "seen" },
  { id: "b", title: "B", state: "streaming" },
];

describe("TabStrip memo", () => {
  it("treats rebuilt arrays with the same content as equal", () => {
    expect(sameTabs(tabs, tabs.map((tab) => ({ ...tab })))).toBe(true);
    expect(sameTabs(tabs, [tabs[0] as TabStripTab, { id: "b", title: "B", state: "done" }])).toBe(false);
    expect(sameTabs(tabs, tabs.slice(0, 1))).toBe(false);
  });

  it("re-renders on active tab or handler changes", () => {
    const onSelect = () => undefined;
    const props = { tabs, activeId: "a", onSelect, onClose: onSelect };
    expect(areTabStripPropsEqual(props, { ...props, tabs: tabs.map((tab) => ({ ...tab })) })).toBe(true);
    expect(areTabStripPropsEqual(props, { ...props, activeId: "b" })).toBe(false);
    expect(areTabStripPropsEqual(props, { ...props, onClose: () => undefined })).toBe(false);
  });

  it("stretches up to six tabs", () => {
    expect(getTabSlotStyle(6)).toEqual({ flex: "1 0 0", minWidth: 132, maxWidth: "none" });
    expect(getTabSlotStyle(7)).toEqual({ flex: "0 0 auto", minWidth: 176, maxWidth: 240 });
  });
});
