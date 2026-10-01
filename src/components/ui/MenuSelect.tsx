import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { useFontScale } from "../../contexts/FontSizeContext";
import { CLOSE_MENUS_EVENT, useDismissibleLayer } from "../../hooks/useDismissibleLayer";
import {
  computeAnchoredMenuPosition,
  edgeActiveIndex,
  moveActiveIndex,
  typeaheadIndex,
  type AnchoredMenuPosition,
  type MenuAlign,
} from "./menuSelectLogic";

export interface MenuSelectOption<V extends string> {
  value: V;
  label: string;
  /** Secondary text shown muted on the right of the row. */
  hint?: string;
  disabled?: boolean;
}

export interface MenuSelectProps<V extends string> {
  value: V;
  options: readonly MenuSelectOption<V>[];
  onChange: (value: V) => void;
  ariaLabel: string;
  disabled?: boolean;
  title?: string;
  /** Merged onto the default trigger style (size, font, width…). */
  triggerStyle?: CSSProperties;
  /** Replaces the trigger's text (defaults to the selected option's label). */
  triggerLabel?: ReactNode;
  menuMinWidth?: number;
  align?: MenuAlign;
  /** Raise above modals (e.g. 1100 inside the Dispatch dialog). */
  menuZIndex?: number;
  /**
   * "field": form control (settings rows). "chip": matches the composer's
   * model chip — mono, uppercase, compact — for inline toolbar selectors.
   */
  variant?: "field" | "chip";
  compact?: boolean;
}

const ROW_HEIGHT = 34;
const TYPEAHEAD_RESET_MS = 700;

/**
 * App-styled replacement for a native <select>: a trigger button plus a
 * portalled listbox popover that matches the model picker's menu surface.
 * Keyboard: ArrowUp/Down, Home/End, Enter/Space, type-ahead, layered Escape.
 */
export function MenuSelect<V extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  disabled = false,
  title,
  triggerStyle,
  triggerLabel,
  menuMinWidth,
  align = "start",
  menuZIndex = 400,
  variant = "field",
  compact = false,
}: MenuSelectProps<V>) {
  const s = useFontScale();
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const typeahead = useRef({ query: "", at: 0 });
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [position, setPosition] = useState<AnchoredMenuPosition | null>(null);

  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = options[selectedIndex];
  const enabled = options.map((option) => !option.disabled);

  const close = useCallback(() => setOpen(false), []);
  useDismissibleLayer(open, triggerRef, menuRef, close);

  const updatePosition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition(
      computeAnchoredMenuPosition(
        rect,
        { width: window.innerWidth, height: window.innerHeight },
        { minWidth: menuMinWidth, align, estimatedHeight: options.length * ROW_HEIGHT + 8 },
      ),
    );
  }, [align, menuMinWidth, options.length]);

  useEffect(() => {
    if (!open) return undefined;
    menuRef.current?.focus();
    const onScroll = (event: Event) => {
      if (!(event.target instanceof Node) || !menuRef.current?.contains(event.target)) close();
    };
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, updatePosition, close]);

  useEffect(() => {
    if (open && activeIndex >= 0) {
      document.getElementById(`${menuId}-opt-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
    }
  }, [open, activeIndex, menuId]);

  const show = () => {
    if (disabled) return;
    window.dispatchEvent(new Event(CLOSE_MENUS_EVENT));
    setActiveIndex(selectedIndex >= 0 && enabled[selectedIndex] ? selectedIndex : edgeActiveIndex(enabled, "first"));
    updatePosition();
    setOpen(true);
  };

  const choose = (index: number) => {
    const option = options[index];
    if (!option || option.disabled) return;
    close();
    triggerRef.current?.focus();
    if (option.value !== value) onChange(option.value);
  };

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      show();
    }
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing) return;
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((index) => moveActiveIndex(enabled, index, event.key === "ArrowDown" ? 1 : -1));
        return;
      case "Home":
      case "End":
        event.preventDefault();
        setActiveIndex(edgeActiveIndex(enabled, event.key === "Home" ? "first" : "last"));
        return;
      case "Enter":
      case " ":
        event.preventDefault();
        choose(activeIndex);
        return;
      case "Tab":
        close();
        return;
      default:
        if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
          const now = event.timeStamp;
          const state = typeahead.current;
          state.query = now - state.at > TYPEAHEAD_RESET_MS ? event.key : state.query + event.key;
          state.at = now;
          const labels = options.map((option) => option.label);
          setActiveIndex((index) => typeaheadIndex(labels, enabled, state.query, index));
        }
    }
  };

  const chip = variant === "chip";
  const textCase: CSSProperties = chip
    ? { fontFamily: "var(--font-mono)", letterSpacing: ".06em", textTransform: "uppercase" }
    : { fontFamily: "var(--font-ui)" };
  const trigger: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    ...(chip
      ? { padding: compact ? "3px 6px" : "4px 12px", borderRadius: 7, color: "var(--text-secondary)", fontSize: s(10) }
      : { height: 30, padding: "0 9px 0 10px", borderRadius: 8, color: "var(--text-primary)", fontSize: s(11) }),
    ...textCase,
    border: "1px solid var(--control-border)",
    background: "var(--control-bg)",
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.5 : 1,
    outline: "none",
    minWidth: 0,
    flexShrink: 0,
    ...triggerStyle,
  };

  const menuStyle: CSSProperties | undefined = position
    ? {
        position: "fixed",
        top: position.top,
        left: position.left,
        minWidth: position.minWidth,
        maxHeight: position.maxHeight,
        overflowY: "auto",
        zIndex: menuZIndex,
        background: "var(--surface-glass)",
        // Small, short-lived popover: the blur is cheap and keeps text behind it from bleeding through.
        backdropFilter: "blur(24px) saturate(1.2)",
        WebkitBackdropFilter: "blur(24px) saturate(1.2)",
        border: "1px solid var(--pane-border)",
        borderRadius: 10,
        padding: 4,
        boxShadow: "var(--shadow-md)",
        animation: "dropIn .15s ease",
        outline: "none",
        WebkitAppRegion: "no-drag",
      }
    : undefined;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title={title}
        disabled={disabled}
        onClick={() => (open ? close() : show())}
        onKeyDown={onTriggerKeyDown}
        style={trigger}
      >
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {triggerLabel ?? selected?.label ?? ""}
        </span>
        <ChevronDown size={11} strokeWidth={2} aria-hidden="true" style={{ flexShrink: 0, color: chip ? undefined : "var(--text-muted)" }} />
      </button>
      {open &&
        position &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="listbox"
            aria-label={ariaLabel}
            aria-activedescendant={activeIndex >= 0 ? `${menuId}-opt-${activeIndex}` : undefined}
            tabIndex={-1}
            onKeyDown={onMenuKeyDown}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            style={menuStyle}
          >
            {options.map((option, index) => {
              const isSelected = index === selectedIndex;
              const isActive = index === activeIndex;
              return (
                <div
                  key={option.value}
                  id={`${menuId}-opt-${index}`}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={option.disabled || undefined}
                  onMouseEnter={() => !option.disabled && setActiveIndex(index)}
                  onClick={() => choose(index)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    minHeight: ROW_HEIGHT - 4,
                    padding: "6px 12px 6px 8px",
                    borderRadius: 6,
                    background: isActive ? "var(--pane-hover)" : "transparent",
                    color: option.disabled ? "var(--text-muted)" : "var(--text-primary)",
                    cursor: option.disabled ? "not-allowed" : "pointer",
                    fontSize: chip ? s(10) : s(11),
                    ...textCase,
                    whiteSpace: "nowrap",
                  }}
                >
                  <span style={{ width: 14, flexShrink: 0, display: "inline-flex" }}>
                    {isSelected && <Check size={13} strokeWidth={2.25} aria-hidden="true" />}
                  </span>
                  <span style={{ flex: 1 }}>{option.label}</span>
                  {option.hint && (
                    <span style={{ marginLeft: 12, color: "var(--text-muted)", fontSize: s(10), fontFamily: "var(--font-mono)" }}>
                      {option.hint}
                    </span>
                  )}
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
