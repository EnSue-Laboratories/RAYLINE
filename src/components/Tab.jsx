import { useState } from "react";
import { X } from "lucide-react";
import { useFontScale } from "../contexts/FontSizeContext";

const DOT_COLORS = {
  streaming: "var(--accent)",
  done: "var(--accent)",
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
        width: "100%",
        height: 28,
        padding: "0 9px 0 11px",
        background: active
          ? "var(--bg-tertiary)"
          : hover
            ? "var(--hover-overlay)"
            : "transparent",
        border: "none",
        borderRadius: 7,
        cursor: "pointer",
        minWidth: 0,
        backdropFilter: active ? "blur(12px) saturate(1.1)" : "none",
        transition: "background .15s, color .15s, backdrop-filter .15s",
      }}
    >
      {!active && (
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
      )}
      <span
        style={{
          flex: 1,
          fontSize: s(11.5),
          color: active ? "var(--text-primary)" : "var(--text-secondary)",
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
          color: active ? "var(--text-secondary)" : "var(--text-muted)",
          cursor: "pointer",
          flexShrink: 0,
          opacity: showClose ? 1 : 0,
          pointerEvents: showClose ? "auto" : "none",
          transition: "opacity .15s, background .15s, color .15s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--hover-overlay)";
          e.currentTarget.style.color = "var(--text-primary)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = active ? "var(--text-secondary)" : "var(--text-muted)";
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
