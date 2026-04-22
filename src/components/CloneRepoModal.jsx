import { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { X, FolderOpen, GitBranch } from "lucide-react";

function deriveRepoDirName(url) {
  const s = String(url || "").trim();
  if (!s) return null;
  const stripped = s.replace(/\/+$/, "").replace(/\.git$/i, "");
  const m = stripped.match(/([^/:\s]+)$/);
  return m ? m[1] : null;
}

export default function CloneRepoModal({ open, onClose, onCloned }) {
  const [url, setUrl] = useState("");
  const [parentDir, setParentDir] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setUrl("");
    setError("");
    setBusy(false);
    (async () => {
      try {
        const info = await window.api?.getSystemInfo?.();
        if (info?.home) setParentDir(info.home);
      } catch { /* ignore */ }
    })();
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape" && !busy) onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  const previewName = useMemo(() => deriveRepoDirName(url), [url]);
  const canClone = url.trim().length > 0 && parentDir.trim().length > 0 && !busy;

  const pickParent = useCallback(async () => {
    const folder = await window.api?.pickFolder?.();
    if (folder) setParentDir(folder);
  }, []);

  const handleClone = useCallback(async () => {
    if (!canClone) return;
    setBusy(true);
    setError("");
    try {
      const result = await window.api?.cloneRepo?.({ url: url.trim(), parentDir });
      if (!result?.ok) {
        setError(result?.stderr || "Clone failed");
        return;
      }
      onCloned?.(result.path);
      onClose?.();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }, [canClone, url, parentDir, onCloned, onClose]);

  if (!open) return null;

  return createPortal(
    <div style={backdropStyle} onPointerDown={() => { if (!busy) onClose?.(); }}>
      <div
        style={cardStyle}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={headerStyle}>
          <div style={titleRowStyle}>
            <GitBranch size={14} strokeWidth={1.8} />
            <span style={titleStyle}>Clone Git Repository</span>
          </div>
          <button
            type="button"
            style={closeBtnStyle}
            onClick={() => { if (!busy) onClose?.(); }}
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>

        <div style={bodyStyle}>
          <div>
            <div style={labelStyle}>Repository URL or owner/repo</div>
            <input
              autoFocus
              type="text"
              placeholder="https://github.com/owner/repo or owner/repo"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleClone(); }}
              style={inputStyle}
              spellCheck={false}
            />
            <div style={hintStyle}>
              Uses <code style={codeStyle}>gh repo clone</code> for GitHub, falls back to <code style={codeStyle}>git clone</code>.
            </div>
          </div>

          <div>
            <div style={labelStyle}>Destination parent folder</div>
            <div style={rowStyle}>
              <input
                type="text"
                value={parentDir}
                onChange={(e) => setParentDir(e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
                spellCheck={false}
              />
              <button type="button" style={secondaryBtnStyle} onClick={pickParent}>
                <FolderOpen size={12} strokeWidth={1.8} style={{ marginRight: 6 }} />
                Browse
              </button>
            </div>
            {previewName && parentDir && (
              <div style={hintStyle}>
                Will clone into <code style={codeStyle}>{parentDir.replace(/\/$/, "")}/{previewName}</code>
              </div>
            )}
          </div>

          {error && <div style={errorStyle}>{error}</div>}
        </div>

        <div style={footerStyle}>
          <button type="button" style={secondaryBtnStyle} onClick={() => { if (!busy) onClose?.(); }} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            style={primaryBtnStyle(canClone)}
            onClick={handleClone}
            disabled={!canClone}
          >
            {busy ? "Cloning…" : "Clone"}
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
  width: 460, maxWidth: "90vw", maxHeight: "85vh",
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
const bodyStyle = { padding: 18, display: "flex", flexDirection: "column", gap: 14 };
const rowStyle = { display: "flex", gap: 8, alignItems: "center" };
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
const inputStyle = {
  width: "100%", padding: "8px 10px", borderRadius: 6,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid var(--pane-border)",
  color: "white", fontSize: 13, fontFamily: "'JetBrains Mono',monospace",
  outline: "none", boxSizing: "border-box",
};
const labelStyle = { fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 4 };
const hintStyle = { fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 6 };
const codeStyle = {
  fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5,
  background: "rgba(255,255,255,0.04)", padding: "1px 5px",
  borderRadius: 4,
};
const errorStyle = {
  fontSize: 12, color: "rgba(255,180,180,0.9)",
  background: "rgba(255,120,120,0.08)",
  padding: "8px 10px", borderRadius: 6,
  border: "1px solid rgba(255,120,120,0.18)",
  whiteSpace: "pre-wrap", wordBreak: "break-word",
};
