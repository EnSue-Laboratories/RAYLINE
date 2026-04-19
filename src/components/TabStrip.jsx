import { useEffect, useRef } from "react";
import Tab from "./Tab";

export default function TabStrip({ tabs, activeId, onSelect, onClose }) {
  const scrollRef = useRef(null);
  const activeRef = useRef(null);

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
        gap: 6,
        overflowX: "auto",
        scrollbarWidth: "none",
        msOverflowStyle: "none",
        flex: 1,
        minWidth: 0,
      }}
      className="tab-strip-scroll"
    >
      {tabs.map((t) => (
        <div key={t.id} ref={t.id === activeId ? activeRef : null}>
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
