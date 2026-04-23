import { useState, useRef, useEffect } from "react";

const inputStyle = {
  width: "100%",
  background: "var(--control-bg)",
  border: "1px solid var(--control-border)",
  borderRadius: 6,
  padding: "8px 10px",
  color: "var(--text-primary)",
  fontSize: 13,
  fontFamily: "system-ui, sans-serif",
  boxSizing: "border-box",
};

export default function SearchableSelect({ options, value, onChange, placeholder }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const containerRef = useRef(null);
  const listRef = useRef(null);

  const filtered = query
    ? options.filter((o) => o.toLowerCase().includes(query.toLowerCase()))
    : options;

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Scroll highlighted item into view
  useEffect(() => {
    if (open && listRef.current) {
      const el = listRef.current.children[highlightIdx];
      if (el) el.scrollIntoView({ block: "nearest" });
    }
  }, [highlightIdx, open]);

  const select = (val) => {
    onChange(val);
    setQuery("");
    setOpen(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[highlightIdx]) select(filtered[highlightIdx]);
    } else if (e.key === "Escape") {
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
          setHighlightIdx(0);
          if (!open) setOpen(true);
        }}
        onFocus={() => {
          setHighlightIdx(0);
          setOpen(true);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder || "Search..."}
        style={inputStyle}
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
            boxShadow: "var(--modal-shadow)",
            border: "1px solid var(--control-border)",
            borderRadius: 6,
            zIndex: 50,
          }}
        >
          {filtered.map((opt, i) => (
            <div
              key={opt}
              onMouseDown={(e) => { e.preventDefault(); select(opt); }}
              onMouseEnter={() => setHighlightIdx(i)}
              style={{
                padding: "6px 10px",
                fontSize: 13,
                fontFamily: "system-ui, sans-serif",
                color: opt === value ? "var(--accent-soft-text)" : "var(--text-secondary)",
                background: i === highlightIdx ? "var(--control-bg-soft)" : "transparent",
                cursor: "pointer",
              }}
            >
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
