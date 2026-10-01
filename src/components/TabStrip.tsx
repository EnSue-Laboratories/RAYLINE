import { memo, useEffect, useMemo, useRef } from "react";
import { useStableCallback } from "../hooks/useStableCallback";
import Tab from "./Tab";
import { areTabStripPropsEqual, getTabSlotStyle, type TabStripTab } from "./sidebar/tabStrip";

export type { TabStripTab } from "./sidebar/tabStrip";
export type { TabState } from "./Tab";

export interface TabStripProps {
  tabs: readonly TabStripTab[];
  activeId: string | null | undefined;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}

const STRIP_CSS = `
  .tab-strip-scroll::-webkit-scrollbar { display: none; }
  @keyframes tabDotPulse {
    0%, 100% { transform: scale(0.8); opacity: 0.7; }
    50%      { transform: scale(1.15); opacity: 1; }
  }
`;

/**
 * Pinned-conversation tabs. Memoized by tab content, and tabs get stable
 * per-id handlers, so stream flushes that rebuild `tabs` don't re-render it.
 */
function TabStrip({ tabs, activeId, onSelect, onClose }: TabStripProps) {
  const activeRef = useRef<HTMLDivElement>(null);
  const handleSelect = useStableCallback(onSelect);
  const handleClose = useStableCallback(onClose);
  const slotStyle = useMemo(() => getTabSlotStyle(tabs.length), [tabs.length]);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [activeId]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 7,
        overflowX: "auto",
        scrollbarWidth: "none",
        msOverflowStyle: "none",
        flex: 1,
        minWidth: 0,
        padding: "1px 0",
        maskImage:
          "linear-gradient(to right, transparent 0, var(--text-primary) 10px, var(--text-primary) calc(100% - 10px), transparent 100%)",
      }}
      className="tab-strip-scroll"
    >
      {tabs.map((tab) => (
        <div key={tab.id} ref={tab.id === activeId ? activeRef : null} style={slotStyle}>
          <Tab
            id={tab.id}
            title={tab.title}
            state={tab.state}
            active={tab.id === activeId}
            onSelect={handleSelect}
            onClose={handleClose}
          />
        </div>
      ))}
      <style>{STRIP_CSS}</style>
    </div>
  );
}

export default memo(TabStrip, areTabStripPropsEqual);
