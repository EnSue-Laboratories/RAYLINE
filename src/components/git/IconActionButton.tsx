import { useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import type { LucideIcon } from "lucide-react";

export interface IconActionButtonProps {
  icon: LucideIcon;
  tooltip: string;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  /** Hidden buttons keep their slot (opacity 0) so rows don't reflow on hover. */
  visible?: boolean;
  hoverColor?: string;
  baseColor?: string;
  disabledColor?: string;
  ariaLabel?: string;
}

interface TipPosition {
  left: number;
  top: number;
}

/** 22px icon button with a portal tooltip; clicks don't bubble to the row. */
export default function IconActionButton({
  icon: Icon,
  tooltip,
  onClick,
  disabled = false,
  visible = true,
  hoverColor = "color-mix(in srgb, var(--text-primary) 78%, transparent)",
  baseColor = "var(--text-secondary)",
  disabledColor = "color-mix(in srgb, var(--text-primary) 13%, transparent)",
  ariaLabel,
}: IconActionButtonProps) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [hovered, setHovered] = useState(false);
  const [tipPos, setTipPos] = useState<TipPosition | null>(null);

  const active = !disabled && visible;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={ariaLabel || tooltip}
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) onClick?.(e);
        }}
        onMouseEnter={() => {
          if (!active) return;
          const r = btnRef.current?.getBoundingClientRect();
          if (r) setTipPos({ left: r.left + r.width / 2, top: r.top });
          setHovered(true);
        }}
        onMouseLeave={() => {
          setHovered(false);
          setTipPos(null);
        }}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 22,
          height: 22,
          borderRadius: 5,
          background: "transparent",
          border: "none",
          color: disabled ? disabledColor : active && hovered ? hoverColor : baseColor,
          cursor: disabled ? "default" : "pointer",
          opacity: visible ? 1 : 0,
          pointerEvents: visible ? "auto" : "none",
          transition: "opacity .12s, color .2s",
          flexShrink: 0,
          marginLeft: 4,
          padding: 0,
        }}
      >
        <Icon size={11} strokeWidth={2} />
      </button>
      {hovered && active && tipPos &&
        createPortal(
          <div
            role="tooltip"
            style={{
              position: "fixed",
              left: tipPos.left,
              top: tipPos.top - 6,
              transform: "translate(-50%, -100%)",
              padding: "3px 7px",
              background: "var(--app-background)",
              border: "1px solid var(--control-border)",
              borderRadius: 4,
              color: "color-mix(in srgb, var(--text-primary) 87%, transparent)",
              fontSize: 9,
              fontFamily: "var(--font-mono)",
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
