import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, X } from "lucide-react";
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

export interface ProjectContextModalProps {
  open: boolean;
  projectName: string;
  initialValue?: string;
  onClose?: () => void;
  onSave?: (value: string) => void;
  locale?: string;
}

const textareaStyle = { ...inputStyle, resize: "vertical" } as const;
const hintStyle = { fontSize: 11, color: "var(--text-muted)" } as const;

/**
 * Edits a project's extra system-prompt context. Lazy-loaded by ProjectGroup
 * (keep the default export). The draft resets each time the dialog opens.
 */
export default function ProjectContextModal(props: ProjectContextModalProps) {
  if (!props.open) return null;
  return <ProjectContextDialog {...props} />;
}

function ProjectContextDialog({ projectName, initialValue, onClose, onSave, locale }: ProjectContextModalProps) {
  const t = useLocaleTranslator(locale);
  const [value, setValue] = useState(initialValue || "");

  const handleSave = useCallback(() => {
    onSave?.(value);
    onClose?.();
  }, [value, onSave, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.isComposing) return;
      e.preventDefault();
      e.stopPropagation();
      onClose?.();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return createPortal(
    <div style={backdropStyle} onPointerDown={() => onClose?.()}>
      <div
        style={cardStyle(560)}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={headerStyle}>
          <div style={titleRowStyle}>
            <FileText size={14} strokeWidth={1.8} />
            <span style={titleStyle}>{t("project.context.title", { project: projectName })}</span>
          </div>
          <button type="button" style={closeBtnStyle} onClick={() => onClose?.()} aria-label={t("project.create.close")}>
            <X size={14} />
          </button>
        </div>

        <div style={bodyStyle(8)}>
          <div style={hintStyle}>{t("project.context.hint")}</div>
          <textarea
            autoFocus
            rows={10}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && isPlainEnter(e)) {
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
            {t("common.cancel")}
          </button>
          <button type="button" style={primaryBtnStyle(true)} onClick={handleSave}>
            {t("common.save")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
