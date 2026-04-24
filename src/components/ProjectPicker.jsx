import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check, FolderClosed, FolderOpen } from "lucide-react";
import { useFontScale } from "../contexts/FontSizeContext";

const MENU_GAP = 6;
const VIEWPORT_PADDING = 8;
const MIN_MENU_WIDTH = 240;
const MAX_MENU_HEIGHT = 360;

function clamp(value, min, max) {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

export default function ProjectPicker({ value, onChange, allCwdRoots, projects, onBrowse }) {
  const s = useFontScale();
  const [open, set] = useState(false);
  const ref = useRef(null);
  const menuRef = useRef(null);
  const [menuStyle, setMenuStyle] = useState(null);

  const projectName = value
    ? (projects?.[value]?.name || value.split("/").pop())
    : "Drafts";

  const updateMenuPosition = useCallback(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const maxMenuWidth = Math.max(0, viewportWidth - VIEWPORT_PADDING * 2);
    const menuWidth = Math.min(
      maxMenuWidth,
      Math.max(rect.width, Math.min(MIN_MENU_WIDTH, maxMenuWidth))
    );
    const maxHeight = Math.min(MAX_MENU_HEIGHT, viewportHeight - VIEWPORT_PADDING * 2);
    const spaceBelow = viewportHeight - rect.bottom - MENU_GAP - VIEWPORT_PADDING;
    const spaceAbove = rect.top - MENU_GAP - VIEWPORT_PADDING;
    const placeAbove = spaceBelow < Math.min(maxHeight, 220) && spaceAbove > spaceBelow;
    const left = clamp(
      rect.right - menuWidth,
      VIEWPORT_PADDING,
      viewportWidth - menuWidth - VIEWPORT_PADDING
    );
    setMenuStyle({
      top: placeAbove
        ? Math.max(VIEWPORT_PADDING, rect.top - MENU_GAP - maxHeight)
        : Math.min(rect.bottom + MENU_GAP, viewportHeight - VIEWPORT_PADDING - maxHeight),
      left,
      width: menuWidth,
      maxHeight,
    });
  }, []);

  useEffect(() => {
    const h = (e) => {
      if (ref.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
      setMenuStyle(null);
      set(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  useEffect(() => {
    if (!open || !ref.current) return;
    const handleResize = () => updateMenuPosition();
    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleResize, true);
    const ro = new ResizeObserver(handleResize);
    ro.observe(ref.current);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleResize, true);
      ro.disconnect();
    };
  }, [open, updateMenuPosition]);

  const visibleRoots = (allCwdRoots || []).filter(
    (cwdRoot) => !projects?.[cwdRoot]?.hidden || cwdRoot === value
  );

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => {
          if (open) {
            set(false);
            setMenuStyle(null);
            return;
          }
          updateMenuPosition();
          set(true);
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 10px",
          background: "color-mix(in srgb, var(--control-bg) 50%, transparent)",
          border: "1px solid var(--control-bg)",
          borderRadius: 7,
          color: "color-mix(in srgb, var(--text-primary) 43%, transparent)",
          fontSize: s(10),
          fontFamily: "'JetBrains Mono',monospace",
          cursor: "pointer",
          transition: "all .2s",
          letterSpacing: ".04em",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "color-mix(in srgb, var(--text-primary) 11%, transparent)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--control-bg)"; }}
      >
        <span
          style={{
            display: "inline-block",
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "var(--badge-open-text)",
            flexShrink: 0,
          }}
        />
        {projectName}
        <ChevronDown size={11} strokeWidth={2} />
      </button>

      {open && menuStyle && createPortal(
        <div
          ref={menuRef}
          style={{
            position: "fixed",
            top: menuStyle.top,
            left: menuStyle.left,
            zIndex: 400,
            width: menuStyle.width,
            maxHeight: menuStyle.maxHeight,
            background: "var(--pane-elevated)",
            backdropFilter: "blur(48px) saturate(1.2)",
            border: "1px solid var(--pane-border)",
            borderRadius: 10,
            padding: 3,
            boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
            animation: "dropIn .15s ease",
            WebkitAppRegion: "no-drag",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Drafts option */}
          <button
            onClick={() => { onChange(null); setMenuStyle(null); set(false); }}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%",
              padding: "8px 12px",
              background: value === null ? "var(--control-bg)" : "transparent",
              border: "none",
              borderRadius: 7,
              color: value === null ? "var(--text-primary)" : "color-mix(in srgb, var(--text-primary) 43%, transparent)",
              fontSize: s(11),
              fontFamily: "'JetBrains Mono',monospace",
              cursor: "pointer",
              textAlign: "left",
              transition: "all .12s",
            }}
            onMouseEnter={(e) => { if (value !== null) e.currentTarget.style.background = "color-mix(in srgb, var(--control-bg) 63%, transparent)"; }}
            onMouseLeave={(e) => { if (value !== null) e.currentTarget.style.background = "transparent"; }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <FolderOpen size={12} strokeWidth={1.8} />
              Drafts
            </span>
            {value === null && <Check size={12} strokeWidth={2.2} />}
          </button>

          {/* Divider */}
          <div style={{ height: 1, background: "var(--control-bg)", margin: "3px 6px" }} />

          {/* Project list */}
          <div style={{ minHeight: 0, overflowY: "auto" }}>
            {visibleRoots.map((cwdRoot) => {
              const isSelected = cwdRoot === value;
              const name = projects?.[cwdRoot]?.name || cwdRoot.split("/").pop();
              return (
                <button
                  key={cwdRoot}
                  onClick={() => { onChange(cwdRoot); setMenuStyle(null); set(false); }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                    padding: "8px 12px",
                    background: isSelected ? "var(--control-bg)" : "transparent",
                    border: "none",
                    borderRadius: 7,
                    color: isSelected ? "var(--text-primary)" : "color-mix(in srgb, var(--text-primary) 43%, transparent)",
                    fontSize: s(11),
                    fontFamily: "'JetBrains Mono',monospace",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all .12s",
                  }}
                  onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "color-mix(in srgb, var(--control-bg) 63%, transparent)"; }}
                  onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
                >
                  <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <FolderClosed size={12} strokeWidth={1.8} style={{ flexShrink: 0 }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {name}
                      </span>
                    </span>
                    <span
                      style={{
                        fontSize: s(9),
                        color: "color-mix(in srgb, var(--text-primary) 22%, transparent)",
                        paddingLeft: 20,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {cwdRoot}
                    </span>
                  </span>
                  {isSelected && <Check size={12} strokeWidth={2.2} style={{ flexShrink: 0 }} />}
                </button>
              );
            })}
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: "var(--control-bg)", margin: "3px 6px" }} />

          {/* Browse option */}
          <button
            onClick={() => { onBrowse(); setMenuStyle(null); set(false); }}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%",
              padding: "8px 12px",
              background: "transparent",
              border: "none",
              borderRadius: 7,
              color: "color-mix(in srgb, var(--text-primary) 43%, transparent)",
              fontSize: s(11),
              fontFamily: "'JetBrains Mono',monospace",
              cursor: "pointer",
              textAlign: "left",
              transition: "all .12s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "color-mix(in srgb, var(--control-bg) 63%, transparent)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <FolderOpen size={12} strokeWidth={1.8} />
              Browse...
            </span>
          </button>
        </div>,
        document.body
      )}
    </div>
  );
}
