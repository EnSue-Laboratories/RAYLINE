import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { FolderOpen, FolderPlus, GitBranch, X } from "lucide-react";
import { useLocaleTranslator } from "./sidebar/useLocaleTranslator";
import {
  backdropStyle,
  bodyStyle,
  cardStyle,
  closeBtnStyle,
  footerStyle,
  headerStyle,
  inputStyle,
  isPlainEnter,
  primaryBtnStyle,
  secondaryBtnStyle,
  titleRowStyle,
  titleStyle,
} from "./sidebar/modalStyles";
import { deriveRepoDirName, joinClonePath } from "./sidebar/projectPaths";

export interface NewProjectModalProps {
  open: boolean;
  onClose?: () => void;
  /** `context` is the optional project context typed in the dialog. */
  onCloned?: (path: string, context?: string) => void;
  onPickedLocalFolder?: (path: string, context?: string) => void;
  locale?: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Clone a repo or register a local folder as a project. React.lazy-loaded by
 * App (keep the default export); the form resets each time it opens.
 */
export default function NewProjectModal(props: NewProjectModalProps) {
  if (!props.open) return null;
  return <NewProjectDialog {...props} />;
}

function NewProjectDialog({ onClose, onCloned, onPickedLocalFolder, locale }: NewProjectModalProps) {
  const t = useLocaleTranslator(locale);
  const [url, setUrl] = useState("");
  const [parentDir, setParentDir] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [contextValue, setContextValue] = useState("");

  useEffect(() => {
    let cancelled = false;
    window.api?.getSystemInfo?.().then(
      (info) => {
        if (!cancelled && info?.home) setParentDir(info.home);
      },
      () => { /* keep the field empty */ },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.isComposing) return;
      e.preventDefault();
      e.stopPropagation();
      if (!busy) onClose?.();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [busy, onClose]);

  const previewName = useMemo(() => deriveRepoDirName(url), [url]);
  const canClone = url.trim().length > 0 && parentDir.trim().length > 0 && !busy;
  const contextOrUndefined = contextValue.trim() || undefined;

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
      onCloned?.(result.path, contextOrUndefined);
      onClose?.();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }, [canClone, url, parentDir, onCloned, onClose, contextOrUndefined, t]);

  const handlePickLocal = useCallback(async () => {
    if (busy) return;
    try {
      const folder = await window.api?.pickFolder?.();
      if (folder) {
        onPickedLocalFolder?.(folder, contextOrUndefined);
        onClose?.();
      }
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [busy, onPickedLocalFolder, onClose, contextOrUndefined]);

  const close = () => {
    if (!busy) onClose?.();
  };

  return createPortal(
    <div style={backdropStyle} onPointerDown={close}>
      <div
        style={cardStyle(460)}
        role="dialog"
        aria-modal="true"
        aria-label={t("project.create.title")}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={headerStyle}>
          <div style={titleRowStyle}>
            <FolderPlus size={14} strokeWidth={1.8} />
            <span style={titleStyle}>{t("project.create.title")}</span>
          </div>
          <button type="button" style={closeBtnStyle} onClick={close} aria-label={t("project.create.close")}>
            <X size={14} />
          </button>
        </div>

        <div style={bodyStyle(14)}>
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
              onKeyDown={(e) => { if (isPlainEnter(e)) void handleClone(); }}
              style={inputStyle}
              spellCheck={false}
              disabled={busy}
            />
            <div style={hintStyle}>{t("project.create.cloneHint")}</div>

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
              <button type="button" style={secondaryBtnStyle} onClick={() => void pickParent()} disabled={busy}>
                <FolderOpen size={12} strokeWidth={1.8} style={{ marginRight: 6 }} />
                {t("project.create.browse")}
              </button>
            </div>
            {previewName && parentDir && (
              <div style={hintStyle}>
                {t("project.create.willCloneInto", { path: joinClonePath(parentDir, previewName) })}
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
              onClick={() => void handlePickLocal()}
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
            <div style={hintStyle}>{t("project.create.contextHint")}</div>
          </div>

          {error && <div style={errorStyle}>{error}</div>}
        </div>

        <div style={footerStyle}>
          <button type="button" style={secondaryBtnStyle} onClick={close} disabled={busy}>
            {t("project.create.cancel")}
          </button>
          <button type="button" style={primaryBtnStyle(canClone)} onClick={() => void handleClone()} disabled={!canClone}>
            {busy ? t("project.create.cloning") : t("project.create.clone")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

const sectionStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 4 };
const sectionHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontSize: 11,
  fontWeight: 500,
  color: "var(--text-secondary)",
  textTransform: "uppercase",
  letterSpacing: 0.4,
  marginBottom: 6,
};
const dividerRowStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 10, padding: "2px 0" };
const dividerLineStyle: CSSProperties = { flex: 1, height: 1, background: "var(--border)" };
const dividerTextStyle: CSSProperties = { fontSize: 10, fontWeight: 500, color: "var(--text-muted)", letterSpacing: 0.8 };
const rowStyle: CSSProperties = { display: "flex", gap: 8, alignItems: "center" };
const labelStyle: CSSProperties = { fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 };
const hintStyle: CSSProperties = { fontSize: 11, color: "var(--text-muted)", marginTop: 6 };
const errorStyle: CSSProperties = {
  fontSize: 12,
  color: "var(--accent)",
  background: "var(--hover-overlay)",
  padding: "8px 10px",
  borderRadius: 6,
  border: "1px solid var(--border-strong)",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};
