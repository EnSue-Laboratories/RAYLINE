import { useEffect, useRef } from "react";
import Tab from "./Tab";

export default function TabStrip({ tabs, activeId, onSelect, onClose }) {
  const scrollRef = useRef(null);
  const activeRef = useRef(null);
  const stretchTabs = tabs.length > 0 && tabs.length <= 6;

  useEffect(() => {
    const el = activeRef.current;
    if (!el) return;
    el.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [activeId]);

  return (
    <div
      ref={scrollRef}
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
        maskImage: "linear-gradient(to right, transparent 0, var(--text-primary) 10px, var(--text-primary) calc(100% - 10px), transparent 100%)",
      }}
      className="tab-strip-scroll"
    >
      {tabs.map((t) => (
        <div
          key={t.id}
          ref={t.id === activeId ? activeRef : null}
          style={{
            flex: stretchTabs ? "1 0 0" : "0 0 auto",
            minWidth: stretchTabs ? 132 : 176,
            maxWidth: stretchTabs ? "none" : 240,
          }}
        >
          <Tab
            title={t.title}
            state={t.state}
            active={t.id === activeId}
            onSelect={() => onSelect(t.id)}
            onClose={() => onClose(t.id)}
          />
        </div>
      ))}
      <style>{`
        .tab-strip-scroll::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}
