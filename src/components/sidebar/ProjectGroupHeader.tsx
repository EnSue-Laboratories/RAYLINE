import { useState, type ReactNode, type Ref } from "react";
import { ChevronRight, FolderClosed, MoreHorizontal, Plus } from "lucide-react";
import { getPaneInteractionStyle } from "../../utils/paneSurface";
import type { FontScale, Translator } from "./types";

export interface ProjectGroupHeaderProps {
  name: string;
  expanded: boolean;
  menuOpen: boolean;
  moreRef: Ref<HTMLButtonElement>;
  s: FontScale;
  t: Translator;
  onToggle: () => void;
  onNewChat: () => void;
  onToggleMenu: () => void;
}

const actionButtonStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "none",
  border: "none",
  color: "var(--sb-text-icon)",
  cursor: "pointer",
  padding: 5,
  width: 26,
  height: 26,
  borderRadius: 4,
  transition: "color .15s",
} as const;

function HeaderAction({
  label,
  buttonRef,
  expanded,
  onClick,
  children,
}: {
  label: string;
  buttonRef?: Ref<HTMLButtonElement>;
  expanded?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      ref={buttonRef}
      aria-label={label}
      aria-expanded={expanded}
      title={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      style={actionButtonStyle}
      onMouseEnter={(e) => { e.currentTarget.style.color = "var(--sb-text-icon-hover)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = "var(--sb-text-icon)"; }}
    >
      {children}
    </button>
  );
}

/**
 * Project row: a collapse toggle (chevron + folder + name) and always-visible
 * "new chat" / "more" actions as separate targets (PR #230).
 */
export default function ProjectGroupHeader({
  name,
  expanded,
  menuOpen,
  moreRef,
  s,
  t,
  onToggle,
  onNewChat,
  onToggleMenu,
}: ProjectGroupHeaderProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        padding: "5px 6px",
        borderRadius: 6,
        minHeight: 26,
        cursor: "pointer",
        transition: "background .15s",
        userSelect: "none",
        ...getPaneInteractionStyle(hovered ? "hover" : "idle"),
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-label={t("projectGroup.toggle", { project: name })}
        onClick={onToggle}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          flex: 1,
          minWidth: 0,
          padding: 0,
          border: 0,
          background: "transparent",
          color: "inherit",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span
          style={{
            display: "flex",
            alignItems: "center",
            color: "var(--sb-text-icon)",
            transform: `rotate(${expanded ? 90 : 0}deg)`,
            transition: "transform .15s",
            flexShrink: 0,
          }}
        >
          <ChevronRight size={12} strokeWidth={1.5} />
        </span>
        <span style={{ display: "flex", alignItems: "center", color: "var(--sb-text-dim)", flexShrink: 0 }}>
          <FolderClosed size={13} strokeWidth={1.5} />
        </span>
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: s(11),
            fontFamily: "var(--font-mono)",
            color: "var(--sb-text-label)",
            letterSpacing: ".04em",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {name}
        </span>
      </button>

      <div style={{ marginLeft: "auto", width: 54, height: 26, position: "relative", flexShrink: 0 }}>
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "50%",
            transform: "translateY(-50%)",
            display: "flex",
            alignItems: "center",
            gap: 2,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <HeaderAction label={t("projectGroup.newChatInProject")} onClick={onNewChat}>
            <Plus size={11} strokeWidth={1.5} />
          </HeaderAction>
          <HeaderAction
            label={t("projectGroup.moreOptions")}
            buttonRef={moreRef}
            expanded={menuOpen}
            onClick={onToggleMenu}
          >
            <MoreHorizontal size={11} strokeWidth={1.5} />
          </HeaderAction>
        </div>
      </div>
    </div>
  );
}
