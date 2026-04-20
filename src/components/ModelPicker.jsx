import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { MODELS, getMOrMulticaFallback } from "../data/models";
import { useFontScale } from "../contexts/FontSizeContext";

const MENU_GAP = 6;
const VIEWPORT_PADDING = 8;
const MIN_MENU_WIDTH = 220;

function extractMulticaErrorStatus(err) {
  if (!err) return null;
  if (typeof err.status === "number") return err.status;
  const msg = err.message || String(err);
  const m = msg.match(/multica \S+ \S+ (\d+):/);
  return m ? Number(m[1]) : null;
}

export default function ModelPicker({ value, onChange, extraModels = [], extraError = null, extraLoading = false }) {
  const s = useFontScale();
  const [open, set] = useState(false);
  const ref = useRef(null);
  const menuRef = useRef(null);
  const [menuStyle, setMenuStyle] = useState(null);
  const m = getMOrMulticaFallback(value, extraModels);

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
          {(() => {
            const all = [...MODELS, ...extraModels];
            return ["claude", "codex", "multica"].map((provider, gi) => {
              const entries = all.filter((mm) => mm.provider === provider);
              const isMulticaEmpty = provider === "multica" && entries.length === 0;
              return (
                <div key={provider}>
                  {gi > 0 && <div style={{ height: 1, background: "rgba(255,255,255,0.04)", margin: "4px 8px" }} />}
                  <div style={{ padding: gi === 0 ? "6px 10px 2px" : "4px 10px 2px", fontSize: s(8), color: "rgba(255,255,255,0.2)", letterSpacing: ".12em", fontFamily: "'JetBrains Mono',monospace" }}>
                    {provider.toUpperCase()}
                  </div>
                  {isMulticaEmpty && (() => {
                    const status = extractMulticaErrorStatus(extraError);
                    if (extraLoading && !extraError) {
                      return (
                        <button
                          key="multica-loading"
                          disabled
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "flex-start",
                            width: "100%",
                            padding: "9px 13px",
                            background: "transparent",
                            border: "none",
                            borderRadius: 7,
                            color: "rgba(255,255,255,0.4)",
                            fontSize: s(11),
                            fontFamily: "'JetBrains Mono',monospace",
                            cursor: "default",
                            textAlign: "left",
                            opacity: 0.5,
                          }}
                        >
                          {"Loading agents\u2026"}
                        </button>
                      );
                    }
                    if (extraError && status === 401) {
                      return (
                        <button
                          key="multica-reconnect"
                          onClick={() => {
                            window.dispatchEvent(new CustomEvent("open-multica-setup"));
                            setMenuStyle(null);
                            set(false);
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            width: "100%",
                            padding: "9px 13px",
                            background: "transparent",
                            border: "none",
                            borderRadius: 7,
                            color: "rgba(255,255,255,0.4)",
                            fontSize: s(11),
                            fontFamily: "'JetBrains Mono',monospace",
                            cursor: "pointer",
                            textAlign: "left",
                            transition: "all .12s",
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.025)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                        >
                          {"Session expired \u2014 reconnect"}
                        </button>
                      );
                    }
                    if (extraError && (status === 403 || status === 404)) {
                      const raw = (extraError.message || String(extraError)).split("\n")[0];
                      const text = raw.length > 80 ? raw.slice(0, 79) + "\u2026" : raw;
                      return (
                        <button
                          key="multica-error-verbatim"
                          disabled
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "flex-start",
                            width: "100%",
                            padding: "9px 13px",
                            background: "transparent",
                            border: "none",
                            borderRadius: 7,
                            color: "rgba(255,255,255,0.4)",
                            fontSize: s(11),
                            fontFamily: "'JetBrains Mono',monospace",
                            cursor: "not-allowed",
                            textAlign: "left",
                            opacity: 0.4,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                          title={extraError.message || String(extraError)}
                        >
                          {text}
                        </button>
                      );
                    }
                    if (extraError) {
                      const raw = (extraError.message || String(extraError)).split("\n")[0];
                      const text = raw.length > 80 ? raw.slice(0, 79) + "\u2026" : raw;
                      return (
                        <button
                          key="multica-error"
                          disabled
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "flex-start",
                            width: "100%",
                            padding: "9px 13px",
                            background: "transparent",
                            border: "none",
                            borderRadius: 7,
                            color: "rgba(255,255,255,0.4)",
                            fontSize: s(11),
                            fontFamily: "'JetBrains Mono',monospace",
                            cursor: "not-allowed",
                            textAlign: "left",
                            opacity: 0.4,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                          title={extraError.message || String(extraError)}
                        >
                          {text}
                        </button>
                      );
                    }
                    return (
                      <button
                        key="multica-connect"
                        onClick={() => {
                          window.dispatchEvent(new CustomEvent("open-multica-setup"));
                          setMenuStyle(null);
                          set(false);
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          width: "100%",
                          padding: "9px 13px",
                          background: "transparent",
                          border: "none",
                          borderRadius: 7,
                          color: "rgba(255,255,255,0.4)",
                          fontSize: s(11),
                          fontFamily: "'JetBrains Mono',monospace",
                          cursor: "pointer",
                          textAlign: "left",
                          transition: "all .12s",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.025)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                      >
                        {"Connect Multica\u2026"}
                      </button>
                    );
                  })()}
                  {entries.map((mm) => (
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
              );
            });
          })()}
        </div>,
        document.body
      )}
    </div>
  );
}
