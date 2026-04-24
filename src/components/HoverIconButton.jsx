import { useRef, useState } from "react";
import { createPortal } from "react-dom";

export default function HoverIconButton({
  tooltip,
  onClick,
  className,
  style,
  children,
  baseColor = "var(--icon-secondary)",
  hoverColor = "var(--icon-primary)",
  ariaLabel,
  disabled = false,
  onMouseEnter,
  onMouseLeave,
}) {
  const btnRef = useRef(null);
  const [hovered, setHovered] = useState(false);
  const [tipPos, setTipPos] = useState(null);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={ariaLabel || tooltip}
        className={className}
        disabled={disabled}
        onClick={(e) => {
          if (!disabled) onClick?.(e);
        }}
        onMouseEnter={(e) => {
          if (!disabled) {
            setHovered(true);
            if (btnRef.current) {
              const r = btnRef.current.getBoundingClientRect();
              setTipPos({ left: r.left + r.width / 2, top: r.top });
            }
          }
          onMouseEnter?.(e);
        }}
        onMouseLeave={(e) => { setHovered(false); setTipPos(null); onMouseLeave?.(e); }}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "none",
          border: "none",
          cursor: disabled ? "default" : "pointer",
          padding: 2,
          flexShrink: 0,
          transition: "color .2s, opacity .15s, background .15s, box-shadow .15s, backdrop-filter .15s",
          ...style,
          color: disabled ? "var(--icon-faint)" : hovered ? hoverColor : baseColor,
        }}
      >
        {children}
      </button>
      {hovered && !disabled && tipPos && tooltip && createPortal(
        <div
          role="tooltip"
          style={{
            position: "fixed",
            left: tipPos.left,
            top: tipPos.top - 6,
            transform: "translate(-50%, -100%)",
            padding: "3px 7px",
            background: "var(--tooltip-bg)",
            border: "1px solid var(--tooltip-border)",
            borderRadius: 4,
            color: "var(--tooltip-text)",
            fontSize: 9,
            fontFamily: "'JetBrains Mono',monospace",
            letterSpacing: ".04em",
            whiteSpace: "nowrap",
            pointerEvents: "none",
            zIndex: 600,
            boxShadow: "var(--tooltip-shadow)",
          }}
        >
          {tooltip}
        </div>,
        document.body,
      )}
    </>
  );
}
