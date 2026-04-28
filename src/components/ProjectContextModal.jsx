import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, FileText } from "lucide-react";

export default function ProjectContextModal({ open, projectName, initialValue, onClose, onSave }) {
  const [value, setValue] = useState(initialValue || "");

  useEffect(() => {
    if (!open) return;
    setValue(initialValue || ""); // eslint-disable-line react-hooks/set-state-in-effect
  }, [open, initialValue]);

  const handleSave = useCallback(() => {
    onSave?.(value);
    onClose?.();
  }, [value, onSave, onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div style={backdropStyle} onPointerDown={() => onClose?.()}>
      <div
        style={cardStyle}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={headerStyle}>
          <div style={titleRowStyle}>
            <FileText size={14} strokeWidth={1.8} />
            <span style={titleStyle}>Project context — {projectName}</span>
          </div>
          <button
            type="button"
            style={closeBtnStyle}
            onClick={() => onClose?.()}
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>

        <div style={bodyStyle}>
          <div style={hintStyle}>
            Appended to the system prompt for every chat in this project.
          </div>
          <textarea
            autoFocus
            rows={10}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                handleSave();
              }
            }}
            style={textareaStyle}
            spellCheck={false}
          />
        </div>

        <div style={footerStyle}>
          <button type="button" style={secondaryBtnStyle} onClick={() => onClose?.()}>
            Cancel
          </button>
          <button
            type="button"
            style={primaryBtnStyle(true)}
            onClick={handleSave}
          >
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

const backdropStyle = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
  display: "flex", alignItems: "center", justifyContent: "center",
  zIndex: 1000, backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
};
const cardStyle = {
  width: 560, maxWidth: "90vw", maxHeight: "85vh",
  background: "var(--pane-elevated)",
  backdropFilter: "blur(48px) saturate(1.2)",
  WebkitBackdropFilter: "blur(48px) saturate(1.2)",
  border: "1px solid var(--pane-border)",
  borderRadius: 12, display: "flex", flexDirection: "column",
  color: "white", fontFamily: "system-ui, sans-serif", fontSize: 13,
  boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
};
const headerStyle = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  padding: "14px 18px", borderBottom: "1px solid var(--pane-border)",
};
const titleRowStyle = { display: "flex", alignItems: "center", gap: 8, color: "rgba(255,255,255,0.85)" };
const titleStyle = { fontSize: 13, fontWeight: 500 };
const closeBtnStyle = {
  background: "none", border: "none", color: "rgba(255,255,255,0.55)",
  cursor: "pointer", padding: 4, display: "flex",
};
const bodyStyle = { padding: 18, display: "flex", flexDirection: "column", gap: 8 };
const footerStyle = {
  display: "flex", justifyContent: "flex-end", gap: 8,
  padding: "12px 18px", borderTop: "1px solid var(--pane-border)",
};
const primaryBtnStyle = (enabled) => ({
  padding: "8px 14px", borderRadius: 6, border: "none",
  background: enabled ? "white" : "rgba(255,255,255,0.1)",
  color: enabled ? "black" : "rgba(255,255,255,0.4)",
  cursor: enabled ? "pointer" : "not-allowed",
  fontSize: 12, fontWeight: 500,
});
const secondaryBtnStyle = {
  padding: "8px 12px", borderRadius: 6,
  background: "transparent",
  border: "1px solid var(--pane-border)",
  color: "rgba(255,255,255,0.7)",
  cursor: "pointer", fontSize: 12,
  display: "flex", alignItems: "center",
};
const textareaStyle = {
  width: "100%", padding: "8px 10px", borderRadius: 6,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid var(--pane-border)",
  color: "white", fontSize: 13, fontFamily: "'JetBrains Mono', monospace",
  outline: "none", boxSizing: "border-box",
  resize: "vertical",
};
const hintStyle = { fontSize: 11, color: "rgba(255,255,255,0.35)" };
