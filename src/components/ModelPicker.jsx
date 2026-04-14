import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { MODELS, getM } from "../data/models";
import { useFontScale } from "../contexts/FontSizeContext";

export default function ModelPicker({ value, onChange }) {
  const s = useFontScale();
  const [open, set] = useState(false);
  const ref = useRef(null);
  const m = getM(value);

  useEffect(() => {
    const h = (e) => {
      if (ref.current && !ref.current.contains(e.target)) set(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => set(!open)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 10px",
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

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            zIndex: 200,
            minWidth: 180,
            background: "rgba(8,8,12,0.92)",
            backdropFilter: "blur(32px)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 10,
            padding: 3,
            boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
            animation: "dropIn .15s ease",
          }}
        >
          {MODELS.map((mm) => (
            <button
              key={mm.id}
              onClick={() => { onChange(mm.id); set(false); }}
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
      )}
    </div>
  );
}
