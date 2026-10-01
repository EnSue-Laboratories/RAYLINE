import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { filterByQuery } from "../pm/listing";
import { formInputStyle } from "../pm/styles";

interface SearchableSelectProps {
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

const identity = (option: string) => option;

/** Text input that filters a dropdown of options (keyboard navigable). */
export default function SearchableSelect({ options, value, onChange, placeholder }: SearchableSelectProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(() => filterByQuery(options, query, identity), [options, query]);

  // Reset the highlight whenever the filtered list changes size (adjusted
  // during render rather than in an effect).
  const [highlightForLength, setHighlightForLength] = useState(filtered.length);
  if (highlightForLength !== filtered.length) {
    setHighlightForLength(filtered.length);
    setHighlightIdx(0);
  }

  // Close on outside click
  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (containerRef.current && event.target instanceof Node && !containerRef.current.contains(event.target)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Scroll highlighted item into view
  useEffect(() => {
    if (!open || !listRef.current) return;
    listRef.current.children[highlightIdx]?.scrollIntoView({ block: "nearest" });
  }, [highlightIdx, open]);

  const select = (option: string) => {
    onChange(option);
    setQuery("");
    setOpen(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightIdx((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const option = filtered[highlightIdx];
      if (option) select(option);
    } else if (event.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  };

  return (
    <div ref={containerRef} style={{ position: "relative", marginTop: 4 }}>
      <input
        type="text"
        value={open ? query : value}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder || "Search..."}
        style={formInputStyle}
      />
      {open && filtered.length > 0 && (
        <div
          ref={listRef}
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            marginTop: 2,
            maxHeight: 180,
            overflowY: "auto",
            background: "var(--pane-elevated)",
            backdropFilter: "blur(48px) saturate(1.2)",
            WebkitBackdropFilter: "blur(48px) saturate(1.2)",
            boxShadow: "var(--shadow-md)",
            border: "1px solid var(--control-border)",
            borderRadius: 6,
            zIndex: 50,
          }}
        >
          {filtered.map((option, i) => (
            <div
              key={option}
              onMouseDown={(e) => {
                e.preventDefault();
                select(option);
              }}
              onMouseEnter={() => setHighlightIdx(i)}
              style={{
                padding: "6px 10px",
                fontSize: 13,
                fontFamily: "var(--font-ui)",
                color: option === value ? "var(--accent-text)" : "var(--text-secondary)",
                background: i === highlightIdx ? "var(--pane-hover)" : "transparent",
                cursor: "pointer",
              }}
            >
              {option}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
