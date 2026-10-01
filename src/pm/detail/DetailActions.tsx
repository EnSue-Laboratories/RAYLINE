import { CheckCircle2, GitMerge, RotateCcw } from "lucide-react";
import type { Translator } from "../../i18n";
import { smallButtonStyle } from "../styles";
import type { PmItemType } from "../types";

interface DetailActionsProps {
  t: Translator;
  type: PmItemType;
  isOpen: boolean;
  isMerged: boolean;
  busy: boolean;
  onMerge: () => void;
  onClose: () => void;
  onReopen: () => void;
}

const actionStyle = { ...smallButtonStyle, color: "var(--text-muted)" };

/** Merge (open PR), close (open issue) or reopen (closed, unmerged). */
export default function DetailActions({ t, type, isOpen, isMerged, busy, onMerge, onClose, onReopen }: DetailActionsProps) {
  return (
    <>
      {type === "pr" && isOpen && (
        <button onClick={onMerge} disabled={busy} style={actionStyle}>
          <GitMerge size={11} strokeWidth={1.5} />
          {busy ? t("pm.merging") : t("pm.merge")}
        </button>
      )}
      {type === "issue" && isOpen && (
        <button onClick={onClose} disabled={busy} style={actionStyle}>
          <CheckCircle2 size={11} strokeWidth={1.5} />
          {busy ? t("pm.closing") : t("pm.close")}
        </button>
      )}
      {!isOpen && !isMerged && (
        <button onClick={onReopen} disabled={busy} style={actionStyle}>
          <RotateCcw size={11} strokeWidth={1.5} />
          {busy ? t("pm.reopening") : t("pm.reopen")}
        </button>
      )}
    </>
  );
}
