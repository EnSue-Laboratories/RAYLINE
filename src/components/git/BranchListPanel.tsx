import { memo, useState } from "react";
import { Check, Trash2, X } from "lucide-react";
import IconActionButton from "./IconActionButton";
import { MenuNote, PromptText, ROW_HOVER_BG, SquareIconButton, TEXT_MUTED } from "./menuParts";
import { isBranchDeletable } from "./branchModel";
import type { FontScale, Translator } from "../sidebar/types";

interface BranchRowProps {
  branch: string;
  isCurrent: boolean;
  deletable: boolean;
  s: FontScale;
  t: Translator;
  onCheckout: (branch: string) => void;
  onRequestDelete: (branch: string) => void;
}

const BranchRow = memo(function BranchRow({ branch, isCurrent, deletable, s, t, onCheckout, onRequestDelete }: BranchRowProps) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        padding: "8px 12px",
        background: isCurrent ? "var(--control-bg)" : hovered ? ROW_HOVER_BG : "transparent",
        borderRadius: 7,
        transition: "all .12s",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        onClick={() => onCheckout(branch)}
        style={{
          display: "flex",
          alignItems: "center",
          flex: 1,
          minWidth: 0,
          background: "none",
          border: "none",
          color: isCurrent ? "var(--text-primary)" : TEXT_MUTED,
          fontSize: s(11),
          fontFamily: "var(--font-mono)",
          cursor: "pointer",
          textAlign: "left",
          padding: 0,
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{branch}</span>
      </button>
      {isCurrent && <Check size={12} strokeWidth={2} style={{ opacity: 0.5, flexShrink: 0 }} />}
      {deletable && (
        <IconActionButton
          icon={Trash2}
          tooltip={t("git.branch.deleteTooltip")}
          visible={hovered}
          onClick={() => onRequestDelete(branch)}
        />
      )}
    </div>
  );
});

export interface BranchListPanelProps {
  branches: readonly string[];
  current: string | null;
  /** Branch awaiting delete confirmation. */
  confirmingDelete: string | null;
  s: FontScale;
  t: Translator;
  onCheckout: (branch: string) => void;
  onRequestDelete: (branch: string) => void;
  onConfirmDelete: (branch: string) => void;
  onCancelDelete: () => void;
}

/** "Branches" tab of the branch menu. */
export default function BranchListPanel({
  branches,
  current,
  confirmingDelete,
  s,
  t,
  onCheckout,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
}: BranchListPanelProps) {
  return (
    <div style={{ maxHeight: 240, overflowY: "auto" }}>
      {branches.map((branch) =>
        branch === confirmingDelete ? (
          <div
            key={branch}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%",
              padding: "8px 12px",
              background: "var(--danger-soft-bg)",
              borderRadius: 7,
              gap: 8,
            }}
          >
            <PromptText s={s} color="var(--danger-soft-text)">
              {t("git.branch.deletePrompt", { name: branch })}
            </PromptText>
            <span style={{ display: "flex", gap: 4, flexShrink: 0 }}>
              <SquareIconButton tone="danger" onClick={() => onConfirmDelete(branch)}>
                <Check size={12} strokeWidth={2} />
              </SquareIconButton>
              <SquareIconButton tone="neutral" onClick={onCancelDelete}>
                <X size={12} strokeWidth={2} />
              </SquareIconButton>
            </span>
          </div>
        ) : (
          <BranchRow
            key={branch}
            branch={branch}
            isCurrent={branch === current}
            deletable={isBranchDeletable(branch, current)}
            s={s}
            t={t}
            onCheckout={onCheckout}
            onRequestDelete={onRequestDelete}
          />
        ),
      )}
      {branches.length === 0 && <MenuNote s={s}>{t("git.branch.noBranchesMatch")}</MenuNote>}
    </div>
  );
}
