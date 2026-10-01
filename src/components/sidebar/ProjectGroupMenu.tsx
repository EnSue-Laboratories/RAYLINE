import type { Ref } from "react";
import { createPortal } from "react-dom";
import { NO_DRAG } from "../../utils/appRegion";
import type { MenuPosition } from "./dropdownPosition";
import type { FontScale, Translator } from "./types";

export interface ProjectGroupMenuProps {
  position: MenuPosition;
  menuRef: Ref<HTMLDivElement>;
  s: FontScale;
  t: Translator;
  onEditContext: () => void;
  onOpenInFinder: () => void;
  onCopyPath: () => void;
  onHide: () => void;
}

function MenuBtn({ s, label, onClick, danger = false }: { s: FontScale; label: string; onClick: () => void; danger?: boolean }) {
  const baseColor = danger ? "var(--danger-soft-text)" : "var(--sb-text)";
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "block",
        width: "100%",
        padding: "8px 13px",
        background: "transparent",
        border: "none",
        borderRadius: 7,
        color: baseColor,
        fontSize: s(11),
        fontFamily: "var(--font-ui)",
        cursor: "pointer",
        textAlign: "left",
        transition: "background .12s, color .12s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--control-bg)";
        e.currentTarget.style.color = danger ? "var(--danger-soft-text)" : "var(--sb-text-92)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = baseColor;
      }}
    >
      {label}
    </button>
  );
}

/** "More options" popover of a project group, portaled to <body>. */
export default function ProjectGroupMenu({
  position,
  menuRef,
  s,
  t,
  onEditContext,
  onOpenInFinder,
  onCopyPath,
  onHide,
}: ProjectGroupMenuProps) {
  return createPortal(
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        top: position.top,
        left: position.left,
        zIndex: 400,
        minWidth: 180,
        background: "var(--pane-elevated)",
        backdropFilter: "blur(48px) saturate(1.2)",
        border: "1px solid var(--pane-border)",
        borderRadius: 10,
        padding: 3,
        boxShadow: "var(--shadow-md)",
        animation: "dropIn .15s ease",
        ...NO_DRAG,
      }}
    >
      <MenuBtn s={s} label={t("projectGroup.editContext")} onClick={onEditContext} />
      <MenuBtn s={s} label={t("projectGroup.openInFinder")} onClick={onOpenInFinder} />
      <MenuBtn s={s} label={t("projectGroup.copyPath")} onClick={onCopyPath} />
      <div style={{ height: 1, background: "var(--control-bg)", margin: "3px 8px" }} />
      <MenuBtn s={s} label={t("projectGroup.hideProject")} danger onClick={onHide} />
    </div>,
    document.body,
  );
}
