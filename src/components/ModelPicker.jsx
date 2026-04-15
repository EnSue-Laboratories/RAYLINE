import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { MODELS, getM } from "../data/models";
import { useFontScale } from "../contexts/FontSizeContext";

const MENU_GAP = 6;
const VIEWPORT_PADDING = 8;
const MIN_BUTTON_WIDTH = 132;
const MIN_MENU_WIDTH = 220;

export default function ModelPicker({ value, onChange }) {
  const s = useFontScale();
  const [open, set] = useState(false);
  const ref = useRef(null);
  const menuRef = useRef(null);
  const [menuStyle, setMenuStyle] = useState(null);
  const m = getM(value);

  const updateMenuPosition = useCallback(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const menuWidth = Math.max(MIN_MENU_WIDTH, rect.width);
    const left = Math.max(
      VIEWPORT_PADDING,
      Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - VIEWPORT_PADDING)
    );
    setMenuStyle({
      top: rect.bottom + MENU_GAP,
      left,
      width: menuWidth,
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
    const ro = new ResizeObserver(handleResize);
    ro.observe(ref.current);
    return () => {
      window.removeEventListener("resize", handleResize);
      ro.disconnect();
    };
  }, [open, updateMenuPosition]);

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
          justifyContent: "space-between",
          gap: 6,
          minWidth: MIN_BUTTON_WIDTH,
          padding: "4px 12px",
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.04)",
          borderRadius: 7,
          color: "rgba(255,255,255,0.4)",
          fontSize: s(10),
          fontFamily: "'JetBrains Mono',monospace",
          cursor: "pointer",
          transition: "all .2s",
          letterSpacing: ".06em",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.04)"; }}
      >
        {m.tag} <ChevronDown size={11} strokeWidth={2} />
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
            background: "rgba(8,8,12,0.55)",
            backdropFilter: "blur(48px) saturate(1.2)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 10,
            padding: 3,
            boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
            animation: "dropIn .15s ease",
            WebkitAppRegion: "no-drag",
          }}
        >
          {["claude", "codex"].map((provider, gi) => (
            <div key={provider}>
              {gi > 0 && <div style={{ height: 1, background: "rgba(255,255,255,0.04)", margin: "4px 8px" }} />}
              <div style={{ padding: "4px 10px 2px", fontSize: s(8), color: "rgba(255,255,255,0.2)", letterSpacing: ".12em", fontFamily: "'JetBrains Mono',monospace" }}>
                {provider.toUpperCase()}
              </div>
              {MODELS.filter(mm => mm.provider === provider).map((mm) => (
                <button
                  key={mm.id}
                  onClick={() => { onChange(mm.id); setMenuStyle(null); set(false); }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                    padding: "9px 13px",
                    background: mm.id === value ? "rgba(255,255,255,0.04)" : "transparent",
                    border: "none",
                    borderRadius: 7,
                    color: mm.id === value ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.4)",
                    fontSize: s(11),
                    fontFamily: "'JetBrains Mono',monospace",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all .12s",
                  }}
                  onMouseEnter={(e) => { if (mm.id !== value) e.currentTarget.style.background = "rgba(255,255,255,0.025)"; }}
                  onMouseLeave={(e) => { if (mm.id !== value) e.currentTarget.style.background = "transparent"; }}
                >
                  {mm.name}
                  <span style={{ fontSize: s(9), opacity: 0.4, letterSpacing: ".1em" }}>{mm.tag}</span>
                </button>
              ))}
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
