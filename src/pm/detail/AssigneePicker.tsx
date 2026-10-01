import { useEffect, useRef, useState } from "react";
import { Check, Plus } from "lucide-react";
import type { GhUser } from "@shared/github/types";
import type { Translate } from "../boundary";
import { SYSTEM_FONT } from "../styles";

interface AssigneePickerProps {
  t: Translate;
  assignees: GhUser[];
  collaborators: GhUser[];
  onToggle: (login: string) => void;
}

/** Current assignees plus a "+" menu listing collaborators to (un)assign. */
export default function AssigneePicker({ t, assignees, collaborators, onToggle }: AssigneePickerProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (event: MouseEvent) => {
      if (menuRef.current && event.target instanceof Node && !menuRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginTop: 12,
        fontSize: 12,
        color: "var(--text-subtle)",
        fontFamily: SYSTEM_FONT,
        position: "relative",
      }}
    >
      <span style={{ fontSize: 11, color: "var(--text-faint)" }}>{t("pm.assignees")}</span>
      {assignees.length > 0 ? (
        assignees.map((assignee) => (
          <div key={assignee.login} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <img src={assignee.avatar_url} alt={assignee.login} style={{ width: 20, height: 20, borderRadius: 10 }} />
            <span style={{ color: "var(--text-muted)", fontSize: 11 }}>{assignee.login}</span>
          </div>
        ))
      ) : (
        <span style={{ fontStyle: "italic", fontSize: 11 }}>{t("pm.none")}</span>
      )}
      <div ref={menuRef} style={{ position: "relative" }}>
        <button
          onClick={() => setOpen((v) => !v)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 20,
            height: 20,
            borderRadius: 10,
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--text-disabled)",
            padding: 0,
            transition: "all .15s",
          }}
        >
          <Plus size={11} strokeWidth={2} />
        </button>

        {open && (
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              marginTop: 4,
              background: "var(--overlay-surface)",
              border: "1px solid var(--control-bg-active)",
              borderRadius: 8,
              padding: "4px 0",
              minWidth: 180,
              zIndex: 100,
              maxHeight: 220,
              overflowY: "auto",
              backdropFilter: "blur(20px)",
            }}
          >
            {collaborators.map((collaborator) => {
              const isAssigned = assignees.some((assignee) => assignee.login === collaborator.login);
              return (
                <button
                  key={collaborator.login}
                  onClick={() => onToggle(collaborator.login)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    width: "100%",
                    background: "none",
                    border: "none",
                    padding: "6px 12px",
                    cursor: "pointer",
                    color: "var(--text-tertiary)",
                    fontSize: 12,
                    fontFamily: SYSTEM_FONT,
                    textAlign: "left",
                  }}
                >
                  <img src={collaborator.avatar_url} alt={collaborator.login} style={{ width: 18, height: 18, borderRadius: 9 }} />
                  <span style={{ flex: 1 }}>{collaborator.login}</span>
                  {isAssigned && <Check size={12} strokeWidth={2} style={{ color: "var(--success-text)" }} />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
