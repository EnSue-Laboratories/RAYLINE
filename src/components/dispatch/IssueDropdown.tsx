import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { CLOSE_MENUS_EVENT, useDismissibleLayer } from "../../hooks/useDismissibleLayer";
import { groupOptions, type DispatchDropdownOption } from "./plan";

interface MenuPosition {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
  maxHeight: number;
}

function computeMenuPosition(rect: DOMRect, fullWidth: boolean): MenuPosition {
  const menuWidth = fullWidth ? rect.width : Math.max(200, rect.width);
  const left = Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8));
  const gap = 6;
  const spaceBelow = window.innerHeight - rect.bottom - gap - 8;
  const spaceAbove = rect.top - gap - 8;
  const flipUp = spaceBelow < 180 && spaceAbove > spaceBelow;
  return {
    top: flipUp ? undefined : rect.bottom + gap,
    bottom: flipUp ? window.innerHeight - rect.top + gap : undefined,
    left,
    width: menuWidth,
    maxHeight: Math.min(320, Math.max(120, flipUp ? spaceAbove : spaceBelow)),
  };
}

export interface IssueDropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: readonly DispatchDropdownOption[];
  placeholder?: string;
  fullWidth?: boolean;
  compact?: boolean;
  grouped?: boolean;
  ariaLabel?: string;
}

/** Grouped dropdown in a portal (used for the per-row issue picker). */
export default function IssueDropdown({
  value,
  onChange,
  options,
  placeholder,
  fullWidth = false,
  compact = false,
  grouped = false,
  ariaLabel,
}: IssueDropdownProps) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuStyle, setMenuStyle] = useState<MenuPosition | null>(null);

  const selected = options.find((o) => o.value === value);
  const triggerText = selected ? (selected.triggerLabel || selected.label) : (placeholder || "");
  const groups = useMemo(() => groupOptions(options, grouped), [options, grouped]);

  const updateMenuPosition = useCallback(() => {
    if (!ref.current) return;
    setMenuStyle(computeMenuPosition(ref.current.getBoundingClientRect(), fullWidth));
  }, [fullWidth]);

  const close = useCallback(() => {
    setOpen(false);
    setMenuStyle(null);
  }, []);
  useDismissibleLayer(open, ref, menuRef, close);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, updateMenuPosition]);

  const toggle = () => {
    if (open) { close(); return; }
    window.dispatchEvent(new Event(CLOSE_MENUS_EVENT));
    updateMenuPosition();
    setOpen(true);
  };

  const triggerStyle: CSSProperties = compact
    ? {
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "3px 6px",
        background: "transparent",
        border: "1px solid " + (hovered ? "var(--control-bg-active)" : "var(--control-bg)"),
        borderRadius: 6,
        color: selected ? "var(--text-secondary)" : "var(--text-muted)",
        fontSize: 10,
        fontFamily: "var(--font-mono)",
        letterSpacing: ".06em",
        cursor: "pointer",
        outline: "none",
        transition: "border-color .2s",
      }
    : {
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 6,
        padding: fullWidth ? "12px 12px" : "6px 10px",
        background: "var(--control-bg-subtle)",
        border: "1px solid var(--control-bg)",
        borderRadius: 7,
        color: selected ? "var(--text-secondary)" : "var(--text-muted)",
        fontSize: fullWidth ? 11 : 10,
        fontFamily: "var(--font-mono)",
        letterSpacing: ".06em",
        cursor: "pointer",
        width: fullWidth ? "100%" : "auto",
        transition: "border-color .2s",
        outline: "none",
      };

  return (
    <div ref={ref} style={{ position: "relative", width: fullWidth ? "100%" : "auto", flexShrink: 0 }}>
      <button
        type="button"
        onClick={toggle}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={triggerStyle}
        onMouseEnter={compact
          ? () => setHovered(true)
          : (e) => { e.currentTarget.style.borderColor = "var(--control-bg-active)"; }}
        onMouseLeave={compact
          ? () => setHovered(false)
          : (e) => { e.currentTarget.style.borderColor = "var(--control-bg)"; }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: fullWidth ? 1 : undefined, textAlign: "left" }}>
          {triggerText}
        </span>
        <ChevronDown size={11} strokeWidth={2} style={{ opacity: 0.45, flexShrink: 0 }} />
      </button>
      {open && menuStyle && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          style={{
            position: "fixed",
            top: menuStyle.top,
            bottom: menuStyle.bottom,
            left: menuStyle.left,
            width: menuStyle.width,
            zIndex: 1200,
            background: "var(--pane-elevated)",
            backdropFilter: "blur(48px) saturate(1.2)",
            WebkitBackdropFilter: "blur(48px) saturate(1.2)",
            border: "1px solid var(--pane-border)",
            borderRadius: 10,
            padding: 3,
            maxHeight: menuStyle.maxHeight || 320,
            overflowY: "auto",
            boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
          }}
        >
          {groups.map(([groupLabel, opts], gi) => (
            <div key={groupLabel || `g${gi}`}>
              {gi > 0 && <div style={{ height: 1, background: "var(--control-bg)", margin: "4px 8px" }} />}
              {groupLabel && (
                <div style={{ padding: gi === 0 ? "6px 10px 2px" : "4px 10px 2px", fontSize: 8, color: "var(--text-disabled)", letterSpacing: ".12em", fontFamily: "var(--font-mono)", textTransform: "uppercase" }}>
                  {groupLabel}
                </div>
              )}
              {opts.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={opt.value === value}
                  onClick={() => { onChange(opt.value); close(); }}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    width: "100%", padding: "8px 12px",
                    background: opt.value === value ? "var(--control-bg)" : "transparent",
                    border: "none", borderRadius: 7,
                    color: opt.value === value ? "var(--text-primary)" : "var(--text-secondary)",
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                    cursor: "pointer", textAlign: "left",
                    transition: "background .12s, color .12s",
                  }}
                  onMouseEnter={(e) => { if (opt.value !== value) e.currentTarget.style.background = "var(--control-bg)"; }}
                  onMouseLeave={(e) => { if (opt.value !== value) e.currentTarget.style.background = "transparent"; }}
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {opt.label}
                  </span>
                  {opt.sublabel && (
                    <span style={{ fontSize: 9, opacity: 0.4, letterSpacing: ".1em", marginLeft: 8, flexShrink: 0 }}>
                      {opt.sublabel}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
