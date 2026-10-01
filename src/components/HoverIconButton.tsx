import { useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

export interface HoverIconButtonProps {
  tooltip?: string;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  baseColor?: string;
  hoverColor?: string;
  ariaLabel?: string;
  disabled?: boolean;
  onMouseEnter?: (event: MouseEvent<HTMLButtonElement>) => void;
  onMouseLeave?: (event: MouseEvent<HTMLButtonElement>) => void;
}

interface TooltipPosition {
  left: number;
  top: number;
}

/** Icon button with a portal tooltip shown on hover and keyboard focus. */
export default function HoverIconButton({
  tooltip,
  onClick,
  className,
  style,
  children,
  baseColor = "var(--text-secondary)",
  hoverColor = "var(--text-primary)",
  ariaLabel,
  disabled = false,
  onMouseEnter,
  onMouseLeave,
}: HoverIconButtonProps) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [tipPos, setTipPos] = useState<TooltipPosition | null>(null);
  const hovered = tipPos !== null;

  const showTooltip = () => {
    if (disabled || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    setTipPos({ left: rect.left + rect.width / 2, top: rect.top });
  };
  const hideTooltip = () => setTipPos(null);

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
          showTooltip();
          onMouseEnter?.(e);
        }}
        onMouseLeave={(e) => {
          hideTooltip();
          onMouseLeave?.(e);
        }}
        onFocus={showTooltip}
        onBlur={hideTooltip}
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
          color: disabled ? "var(--text-muted)" : hovered ? hoverColor : baseColor,
        }}
      >
        {children}
      </button>
      {!disabled && tipPos && tooltip && createPortal(
        <div
          role="tooltip"
          style={{
            position: "fixed",
            left: tipPos.left,
            top: tipPos.top - 6,
            transform: "translate(-50%, -100%)",
            padding: "3px 7px",
            background: "var(--bg-secondary)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            color: "var(--text-primary)",
            fontSize: 9,
            fontFamily: "var(--font-mono)",
            letterSpacing: ".04em",
            whiteSpace: "nowrap",
            pointerEvents: "none",
            zIndex: 600,
            boxShadow: "var(--shadow-sm)",
          }}
        >
          {tooltip}
        </div>,
        document.body,
      )}
    </>
  );
}
