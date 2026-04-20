import { useState } from "react";
import { X } from "lucide-react";
import { useFontScale } from "../contexts/FontSizeContext";

const DOT_COLORS = {
  streaming: "rgba(120, 200, 255, 0.9)",
  done: "rgba(255, 190, 120, 0.95)",
  seen: "transparent",
};

export default function Tab({ title, state, active, onSelect, onClose }) {
  const s = useFontScale();
  const [hover, setHover] = useState(false);
  const dotColor = DOT_COLORS[state] || "transparent";
  const pulse = state === "streaming";
  const showClose = active || hover;

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={title}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 7,
        height: 28,
        padding: "0 7px 0 10px",
        background: active
          ? "rgba(255,255,255,0.07)"
          : hover
            ? "rgba(255,255,255,0.04)"
            : "rgba(255,255,255,0.018)",
        border: "none",
        borderRadius: 7,
        cursor: "pointer",
        flexShrink: 0,
        maxWidth: 190,
        backdropFilter: active ? "blur(12px) saturate(1.1)" : "none",
        transition: "background .15s, color .15s, backdrop-filter .15s",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: dotColor,
          flexShrink: 0,
          animation: pulse ? "tabDotPulse 1.4s ease-in-out infinite" : "none",
          boxShadow: state === "seen" ? "none" : `0 0 14px ${dotColor}`,
          transition: "background .25s, box-shadow .25s",
        }}
      />
      <span
        style={{
          fontSize: s(11.5),
          color: active ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.66)",
          fontFamily: "system-ui, sans-serif",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          minWidth: 0,
        }}
      >
        {title || "Untitled"}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose?.();
        }}
        aria-label="Close tab"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 15,
          height: 15,
          borderRadius: 5,
          background: "transparent",
          border: "none",
          color: active ? "rgba(255,255,255,0.48)" : "rgba(255,255,255,0.34)",
          cursor: "pointer",
          flexShrink: 0,
          opacity: showClose ? 1 : 0,
          pointerEvents: showClose ? "auto" : "none",
          transition: "opacity .15s, background .15s, color .15s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(255,255,255,0.06)";
          e.currentTarget.style.color = "rgba(255,255,255,0.78)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = active ? "rgba(255,255,255,0.48)" : "rgba(255,255,255,0.34)";
        }}
      >
        <X size={10} strokeWidth={1.75} />
      </button>
      <style>{`
        @keyframes tabDotPulse {
          0%, 100% { transform: scale(0.8); opacity: 0.7; }
          50%      { transform: scale(1.15); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
