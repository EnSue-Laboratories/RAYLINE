import { useRef, useState } from "react";
import { createPortal } from "react-dom";

export default function HoverIconButton({
  tooltip,
  onClick,
  className,
  style,
  children,
  baseColor = "rgba(255,255,255,0.5)",
  hoverColor = "rgba(255,255,255,0.9)",
  ariaLabel,
  disabled = false,
  onMouseEnter,
  onMouseLeave,
}) {
  const btnRef = useRef(null);
  const [hovered, setHovered] = useState(false);
  const [tipPos, setTipPos] = useState(null);

  const handleMouseEnter = (e) => {
    if (!disabled) {
      setHovered(true);
      if (btnRef.current) {
        const r = btnRef.current.getBoundingClientRect();
        setTipPos({ left: r.left + r.width / 2, top: r.top });
      }
    }
    onMouseEnter?.(e);
  };

  const handleMouseLeave = (e) => {
    setHovered(false);
    setTipPos(null);
    onMouseLeave?.(e);
  };

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
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
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
          color: disabled ? "rgba(255,255,255,0.15)" : hovered ? hoverColor : baseColor,
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
            background: "rgba(14,14,18,0.95)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 4,
            color: "rgba(255,255,255,0.8)",
            fontSize: 9,
            fontFamily: "'JetBrains Mono',monospace",
            letterSpacing: ".04em",
            whiteSpace: "nowrap",
            pointerEvents: "none",
            zIndex: 600,
            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
          }}
        >
          {tooltip}
        </div>,
        document.body,
      )}
    </>
  );
}
