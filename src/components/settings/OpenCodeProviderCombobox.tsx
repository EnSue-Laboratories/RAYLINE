import { memo, useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { Check, ChevronDown } from "lucide-react";
import type { FontScale, Translator } from "./deps";
import { filterOpenCodeProviderOptions, moveHighlight } from "./helpers";
import { getSettingsStyles } from "./styles";

interface OpenCodeProviderComboboxProps {
  s: FontScale;
  t: Translator;
  value: string;
  options: readonly string[];
  onChange: (providerId: string) => void;
  hasWallpaper: boolean;
}

/** Free-text provider id with a filtered suggestion list (ArrowUp/Down, Enter, Escape). */
export const OpenCodeProviderCombobox = memo(function OpenCodeProviderCombobox({
  s,
  t,
  value,
  options,
  onChange,
  hasWallpaper,
}: OpenCodeProviderComboboxProps) {
  const styles = getSettingsStyles(s);
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const filtered = filterOpenCodeProviderOptions(options, value);
  const active = Math.min(highlight, Math.max(filtered.length - 1, 0));

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event: MouseEvent) => {
      if (!(event.target instanceof Node) || !rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  const select = (providerId: string) => {
    onChange(providerId);
    setOpen(false);
    setHighlight(0);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setHighlight(moveHighlight(active, 1, filtered.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight(moveHighlight(active, -1, filtered.length));
    } else if (event.key === "Enter" && open && filtered[active]) {
      event.preventDefault();
      select(filtered[active]);
    } else if (event.key === "Escape" && open) {
      // Close only the suggestions, not the surrounding screen.
      event.stopPropagation();
      setOpen(false);
    }
  };

  // Solid surface without a wallpaper: a backdrop blur here re-renders on every scroll frame.
  const listSurface: CSSProperties = hasWallpaper
    ? {
        background: "linear-gradient(180deg, rgba(20,24,34,0.24), rgba(8,10,16,0.16))",
        backdropFilter: "blur(42px) saturate(1.35)",
        WebkitBackdropFilter: "blur(42px) saturate(1.35)",
      }
    : { background: "var(--surface-glass)" };

  return (
    <div ref={rootRef} style={{ position: "relative", minWidth: 0 }}>
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls={listId}
        aria-activedescendant={open && filtered[active] ? `${listId}-${active}` : undefined}
        value={value}
        placeholder={t("settings.opencodeProviderPlaceholder")}
        aria-label={t("settings.opencodeProviderSelect")}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        style={{ ...styles.input, paddingRight: 34 }}
        title={t("settings.opencodeProviderSelect")}
      />
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 1,
          right: 1,
          width: 30,
          height: 30,
          borderLeft: "1px solid color-mix(in srgb, var(--text-primary) 6%, transparent)",
          borderRadius: "0 6px 6px 0",
          background: "color-mix(in srgb, var(--text-primary) 3%, transparent)",
          color: "color-mix(in srgb, var(--text-primary) 58%, transparent)",
          display: "grid",
          placeItems: "center",
          pointerEvents: "none",
        }}
      >
        <ChevronDown
          size={14}
          strokeWidth={2.2}
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform .16s ease" }}
        />
      </span>
      {open && filtered.length > 0 && (
        <div
          id={listId}
          role="listbox"
          style={{
            position: "absolute",
            top: "calc(100% + 5px)",
            left: 0,
            right: 0,
            zIndex: 80,
            maxHeight: 196,
            overflowY: "auto",
            padding: 4,
            borderRadius: 8,
            border: "1px solid color-mix(in srgb, var(--text-primary) 10%, transparent)",
            boxShadow: "0 18px 54px rgba(0,0,0,0.18), inset 0 1px 0 color-mix(in srgb, var(--text-primary) 6%, transparent)",
            ...listSurface,
          }}
        >
          {filtered.map((provider, index) => {
            const highlighted = index === active;
            const selected = provider === value.trim();
            return (
              <button
                key={provider}
                id={`${listId}-${index}`}
                type="button"
                role="option"
                aria-selected={selected}
                tabIndex={-1}
                onMouseDown={(e) => {
                  e.preventDefault();
                  select(provider);
                }}
                onMouseEnter={() => setHighlight(index)}
                style={{
                  width: "100%",
                  height: 30,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  padding: "0 8px",
                  border: "none",
                  borderRadius: 6,
                  background: highlighted
                    ? "color-mix(in srgb, var(--text-primary) 10%, transparent)"
                    : selected
                      ? "color-mix(in srgb, var(--text-primary) 6%, transparent)"
                      : "transparent",
                  color: selected ? "var(--accent)" : "color-mix(in srgb, var(--text-primary) 74%, transparent)",
                  cursor: "pointer",
                  fontFamily: "var(--font-mono)",
                  fontSize: s(11),
                  textAlign: "left",
                  transition: "background .14s ease, color .14s ease",
                }}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{provider}</span>
                {selected && <Check size={12} strokeWidth={2.4} style={{ flex: "0 0 auto" }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});
