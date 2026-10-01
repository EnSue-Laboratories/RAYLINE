import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { FontScale, Translator } from "../sidebar/types";

export interface GitConfirmDialogProps {
  s: FontScale;
  t: Translator;
  title: string;
  body: string;
  confirmLabel?: string;
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Modal confirm (Enter confirms, Escape cancels; captured before other handlers). */
export default function GitConfirmDialog({ s, t, title, body, confirmLabel, destructive = false, onCancel, onConfirm }: GitConfirmDialogProps) {
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    confirmBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      } else if (e.key === "Enter") {
        e.stopPropagation();
        onConfirm();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onCancel, onConfirm]);

  const accent = destructive ? "var(--danger-soft-text)" : "var(--badge-open-text)";
  const accentBg = destructive ? "var(--danger-soft-bg)" : "var(--badge-open-bg)";
  const accentBorder = destructive ? "var(--danger-soft-border)" : "var(--badge-open-border)";

  return createPortal(
    <div
      onMouseDown={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "rgba(0,0,0,0.25)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: "var(--font-ui)",
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{
          width: "min(420px, 100%)",
          background: "var(--pane-elevated)",
          border: "1px solid color-mix(in srgb, var(--text-primary) 11%, transparent)",
          borderRadius: 14,
          boxShadow: "0 24px 60px rgba(0,0,0,0.55)",
          backdropFilter: "blur(72px) saturate(1.15)",
          WebkitBackdropFilter: "blur(72px) saturate(1.15)",
          color: "var(--text-primary)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "16px 18px 4px", fontSize: s(14), fontWeight: 600, letterSpacing: "-0.005em" }}>{title}</div>
        <div
          style={{
            padding: "4px 18px 16px",
            fontSize: s(12),
            lineHeight: 1.5,
            color: "color-mix(in srgb, var(--text-primary) 71%, transparent)",
          }}
        >
          {body}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", padding: "4px 12px 12px" }}>
          <button
            onClick={onCancel}
            style={{
              height: 30,
              padding: "0 14px",
              background: "color-mix(in srgb, var(--control-border) 63%, transparent)",
              border: "1px solid var(--control-border)",
              borderRadius: 7,
              color: "color-mix(in srgb, var(--text-primary) 87%, transparent)",
              fontSize: s(12),
              fontFamily: "var(--font-ui)",
              cursor: "pointer",
            }}
          >
            {t("git.status.cancel")}
          </button>
          <button
            ref={confirmBtnRef}
            onClick={onConfirm}
            style={{
              height: 30,
              padding: "0 14px",
              background: accentBg,
              border: "1px solid " + accentBorder,
              borderRadius: 7,
              color: accent,
              fontSize: s(12),
              fontFamily: "var(--font-ui)",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {confirmLabel || t("git.status.confirm")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
