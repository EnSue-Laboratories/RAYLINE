import { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { X, FolderOpen, GitBranch, FolderPlus } from "lucide-react";
import { createTranslator } from "../i18n";

function deriveRepoDirName(url) {
  const s = String(url || "").trim();
  if (!s) return null;
  const stripped = s.replace(/\/+$/, "").replace(/\.git$/i, "");
  const m = stripped.match(/([^/:\s]+)$/);
  return m ? m[1] : null;
}

export default function NewProjectModal({ open, onClose, onCloned, onPickedLocalFolder, locale = "en-US" }) {
  const t = useMemo(() => createTranslator(locale), [locale]);
  const [url, setUrl] = useState("");
  const [parentDir, setParentDir] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [contextValue, setContextValue] = useState("");

  useEffect(() => {
    if (!open) return;
    setUrl("");
    setError("");
    setBusy(false);
    setContextValue("");
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
        setError(result?.stderr || t("project.create.cloneFailed"));
        return;
      }
      onCloned?.(result.path, contextValue.trim() || undefined);
      onClose?.();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }, [canClone, url, parentDir, onCloned, onClose, contextValue, t]);

  const handlePickLocal = useCallback(async () => {
    if (busy) return;
    try {
      const folder = await window.api?.pickFolder?.();
      if (folder) {
        onPickedLocalFolder?.(folder, contextValue.trim() || undefined);
        onClose?.();
      }
    } catch (e) {
      setError(e?.message || String(e));
    }
  }, [busy, onPickedLocalFolder, onClose, contextValue]);

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
            <FolderPlus size={14} strokeWidth={1.8} />
            <span style={titleStyle}>{t("project.create.title")}</span>
          </div>
          <button
            type="button"
            style={closeBtnStyle}
            onClick={() => { if (!busy) onClose?.(); }}
            aria-label={t("project.create.close")}
          >
            <X size={14} />
          </button>
        </div>

        <div style={bodyStyle}>
          <div style={sectionStyle}>
            <div style={sectionHeaderStyle}>
              <GitBranch size={12} strokeWidth={1.8} />
              <span>{t("project.create.cloneFromGit")}</span>
            </div>
            <input
              autoFocus
              type="text"
              placeholder={t("project.create.repoPlaceholder")}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleClone(); }}
              style={inputStyle}
              spellCheck={false}
              disabled={busy}
            />
            <div style={hintStyle}>
              {t("project.create.cloneHint")}
            </div>

            <div style={{ ...labelStyle, marginTop: 10 }}>{t("project.create.destinationParentFolder")}</div>
            <div style={rowStyle}>
              <input
                type="text"
                value={parentDir}
                onChange={(e) => setParentDir(e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
                spellCheck={false}
                disabled={busy}
              />
              <button type="button" style={secondaryBtnStyle} onClick={pickParent} disabled={busy}>
                <FolderOpen size={12} strokeWidth={1.8} style={{ marginRight: 6 }} />
                {t("project.create.browse")}
              </button>
            </div>
            {previewName && parentDir && (
              <div style={hintStyle}>
                {t("project.create.willCloneInto", { path: `${parentDir.replace(/\/$/, "")}/${previewName}` })}
              </div>
            )}
          </div>

          <div style={dividerRowStyle}>
            <div style={dividerLineStyle} />
            <span style={dividerTextStyle}>{t("project.create.or")}</span>
            <div style={dividerLineStyle} />
          </div>

          <div style={sectionStyle}>
            <div style={sectionHeaderStyle}>
              <FolderOpen size={12} strokeWidth={1.8} />
              <span>{t("project.create.openLocalFolder")}</span>
            </div>
            <div style={hintStyle}>{t("project.create.localFolderHint")}</div>
            <button
              type="button"
              style={{ ...secondaryBtnStyle, marginTop: 8, alignSelf: "flex-start" }}
              onClick={handlePickLocal}
              disabled={busy}
            >
              <FolderOpen size={12} strokeWidth={1.8} style={{ marginRight: 6 }} />
              {t("project.create.chooseFolder")}
            </button>
          </div>

          <div style={sectionStyle}>
            <div style={sectionHeaderStyle}>
              <span>{t("project.create.contextTitle")}</span>
            </div>
            <textarea
              rows={5}
              value={contextValue}
              onChange={(e) => setContextValue(e.target.value)}
              placeholder={t("project.create.contextPlaceholder")}
              style={{ ...inputStyle, resize: "vertical", minHeight: 88 }}
              spellCheck={false}
              disabled={busy}
            />
            <div style={hintStyle}>
              {t("project.create.contextHint")}
            </div>
          </div>

          {error && <div style={errorStyle}>{error}</div>}
        </div>

        <div style={footerStyle}>
          <button type="button" style={secondaryBtnStyle} onClick={() => { if (!busy) onClose?.(); }} disabled={busy}>
            {t("project.create.cancel")}
          </button>
          <button
            type="button"
            style={primaryBtnStyle(canClone)}
            onClick={handleClone}
            disabled={!canClone}
          >
            {busy ? t("project.create.cloning") : t("project.create.clone")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

const backdropStyle = {
  position: "fixed", inset: 0, background: "color-mix(in srgb, var(--bg-primary) 45%, transparent)",
  display: "flex", alignItems: "center", justifyContent: "center",
  zIndex: 1000, backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
};
const cardStyle = {
  width: 460, maxWidth: "90vw", maxHeight: "85vh",
  background: "var(--surface-glass)",
  backdropFilter: "blur(48px) saturate(1.2)",
  WebkitBackdropFilter: "blur(48px) saturate(1.2)",
  border: "1px solid var(--border)",
  borderRadius: 12, display: "flex", flexDirection: "column",
  color: "var(--text-primary)", fontFamily: "var(--font-ui)", fontSize: 13,
  boxShadow: "var(--shadow-md)",
};
const headerStyle = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  padding: "14px 18px", borderBottom: "1px solid var(--border)",
};
const titleRowStyle = { display: "flex", alignItems: "center", gap: 8, color: "var(--text-primary)" };
const titleStyle = { fontSize: 13, fontWeight: 500 };
const closeBtnStyle = {
  background: "none", border: "none", color: "var(--text-secondary)",
  cursor: "pointer", padding: 4, display: "flex",
};
const bodyStyle = { padding: 18, display: "flex", flexDirection: "column", gap: 14 };
const sectionStyle = { display: "flex", flexDirection: "column", gap: 4 };
const sectionHeaderStyle = {
  display: "flex", alignItems: "center", gap: 6,
  fontSize: 11, fontWeight: 500,
  color: "var(--text-secondary)",
  textTransform: "uppercase", letterSpacing: 0.4,
  marginBottom: 6,
};
const dividerRowStyle = {
  display: "flex", alignItems: "center", gap: 10,
  padding: "2px 0",
};
const dividerLineStyle = {
  flex: 1, height: 1, background: "var(--border)",
};
const dividerTextStyle = {
  fontSize: 10, fontWeight: 500,
  color: "var(--text-muted)",
  letterSpacing: 0.8,
};
const rowStyle = { display: "flex", gap: 8, alignItems: "center" };
const footerStyle = {
  display: "flex", justifyContent: "flex-end", gap: 8,
  padding: "12px 18px", borderTop: "1px solid var(--border)",
};
const primaryBtnStyle = (enabled) => ({
  padding: "8px 14px", borderRadius: 6, border: "none",
  background: enabled ? "var(--text-primary)" : "var(--bg-tertiary)",
  color: enabled ? "var(--bg-primary)" : "var(--text-muted)",
  cursor: enabled ? "pointer" : "not-allowed",
  fontSize: 12, fontWeight: 500,
});
const secondaryBtnStyle = {
  padding: "8px 12px", borderRadius: 6,
  background: "transparent",
  border: "1px solid var(--border)",
  color: "var(--text-secondary)",
  cursor: "pointer", fontSize: 12,
  display: "flex", alignItems: "center",
};
const inputStyle = {
  width: "100%", padding: "8px 10px", borderRadius: 6,
  background: "var(--bg-tertiary)",
  border: "1px solid var(--border)",
  color: "var(--text-primary)", fontSize: 13, fontFamily: "var(--font-mono)",
  outline: "none", boxSizing: "border-box",
};
const labelStyle = { fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 };
const hintStyle = { fontSize: 11, color: "var(--text-muted)", marginTop: 6 };
const errorStyle = {
  fontSize: 12, color: "var(--accent)",
  background: "var(--hover-overlay)",
  padding: "8px 10px", borderRadius: 6,
  border: "1px solid var(--border-strong)",
  whiteSpace: "pre-wrap", wordBreak: "break-word",
};
