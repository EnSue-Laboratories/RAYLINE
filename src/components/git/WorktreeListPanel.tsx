import { memo, useState } from "react";
import { ArrowUpFromLine, Check, Loader2, Trash2, X } from "lucide-react";
import type { GitWorktree } from "@shared/git/types";
import IconActionButton from "./IconActionButton";
import { MenuNote, PromptText, ROW_HOVER_BG, SquareIconButton, TEXT_LOCKED, TEXT_MUTED } from "./menuParts";
import { getWorktreeName } from "./branchModel";
import type { FontScale, Translator } from "../sidebar/types";

interface WorktreeRowProps {
  worktree: GitWorktree;
  isActive: boolean;
  locked: boolean;
  canPromote: boolean;
  s: FontScale;
  t: Translator;
  onSwitch: (worktree: GitWorktree) => void;
  onRequestPromote: (worktree: GitWorktree) => void;
  onRequestDelete: (worktree: GitWorktree) => void;
}

const WorktreeRow = memo(function WorktreeRow({
  worktree: wt,
  isActive,
  locked,
  canPromote,
  s,
  t,
  onSwitch,
  onRequestPromote,
  onRequestDelete,
}: WorktreeRowProps) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        width: "100%",
        padding: "8px 12px",
        background: isActive ? "var(--control-bg)" : hovered ? ROW_HOVER_BG : "transparent",
        borderRadius: 7,
        transition: "all .12s",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        onClick={() => {
          if (!locked) onSwitch(wt);
        }}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          flex: 1,
          minWidth: 0,
          background: "none",
          border: "none",
          color: isActive ? "var(--text-primary)" : locked ? TEXT_LOCKED : TEXT_MUTED,
          fontSize: s(11),
          fontFamily: "var(--font-mono)",
          cursor: locked && !isActive ? "default" : "pointer",
          textAlign: "left",
          padding: 0,
          gap: 2,
        }}
      >
        <span style={{ display: "flex", alignItems: "center", width: "100%", gap: 6 }}>
          <span>{getWorktreeName(wt.path)}</span>
          {isActive && <Check size={12} strokeWidth={2} style={{ opacity: 0.5, flexShrink: 0 }} />}
        </span>
        <span
          style={{
            fontSize: s(8),
            color: "color-mix(in srgb, var(--text-primary) 22%, transparent)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: "100%",
          }}
        >
          {wt.branch || t("git.branch.detached")}
        </span>
      </button>
      {canPromote && (
        <IconActionButton
          icon={ArrowUpFromLine}
          tooltip={t("git.branch.promoteTooltip")}
          visible={hovered}
          onClick={() => onRequestPromote(wt)}
        />
      )}
      {!isActive && (
        <IconActionButton
          icon={Trash2}
          tooltip={t("git.branch.deleteTooltip")}
          visible={hovered}
          onClick={() => onRequestDelete(wt)}
        />
      )}
    </div>
  );
});

function NoneOption({ selected, locked, s, t, onSelect }: {
  selected: boolean;
  locked: boolean;
  s: FontScale;
  t: Translator;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={() => {
        if (locked || selected) return;
        onSelect();
      }}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        padding: "8px 12px",
        background: selected ? "var(--control-bg)" : "transparent",
        border: "none",
        borderRadius: 7,
        color: selected ? "var(--text-primary)" : locked ? TEXT_LOCKED : TEXT_MUTED,
        fontSize: s(11),
        fontFamily: "var(--font-mono)",
        cursor: locked && !selected ? "default" : "pointer",
        textAlign: "left",
        transition: "all .12s",
      }}
      onMouseEnter={(e) => { if (!locked && !selected) e.currentTarget.style.background = ROW_HOVER_BG; }}
      onMouseLeave={(e) => { if (!selected) e.currentTarget.style.background = "transparent"; }}
    >
      <span>{t("git.branch.none")}</span>
      {selected && <Check size={12} strokeWidth={2} style={{ opacity: 0.5, flexShrink: 0 }} />}
    </button>
  );
}

export interface WorktreeListPanelProps {
  worktrees: readonly GitWorktree[];
  mainWorktree: GitWorktree | null;
  cwd: string;
  /** Switching is disabled once the conversation has messages. */
  locked: boolean;
  confirmingDeletePath: string | null;
  deleteBranchToo: boolean;
  promotingPath: string | null;
  promoting: boolean;
  promoteError: string | null;
  s: FontScale;
  t: Translator;
  onSelectMain: () => void;
  onSwitch: (worktree: GitWorktree) => void;
  onRequestPromote: (worktree: GitWorktree) => void;
  onConfirmPromote: () => void;
  onCancelPromote: () => void;
  onRequestDelete: (worktree: GitWorktree) => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onToggleDeleteBranch: () => void;
}

/** "Worktrees" tab of the branch menu. */
export default function WorktreeListPanel({
  worktrees,
  mainWorktree,
  cwd,
  locked,
  confirmingDeletePath,
  deleteBranchToo,
  promotingPath,
  promoting,
  promoteError,
  s,
  t,
  onSelectMain,
  onSwitch,
  onRequestPromote,
  onConfirmPromote,
  onCancelPromote,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
  onToggleDeleteBranch,
}: WorktreeListPanelProps) {
  const isInWorktree = Boolean(mainWorktree) && cwd !== mainWorktree?.path;

  return (
    <div style={{ maxHeight: 240, overflowY: "auto" }}>
      {locked && (
        <MenuNote s={s} padding="6px 12px" letterSpacing=".04em">
          {t("git.branch.startNewChatToSwitch")}
        </MenuNote>
      )}
      {mainWorktree && <NoneOption selected={!isInWorktree} locked={locked} s={s} t={t} onSelect={onSelectMain} />}
      {worktrees.map((wt) => {
        const label = wt.branch || t("git.branch.worktreeLabel");
        if (wt.path === promotingPath) {
          return (
            <div key={wt.path} style={{ padding: "8px 12px", background: "var(--badge-open-bg)", borderRadius: 7 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <PromptText s={s} color="var(--badge-open-text)">
                  {t("git.branch.promotePrompt", { name: label })}
                </PromptText>
                <span style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  <SquareIconButton
                    tone="positive"
                    onClick={onConfirmPromote}
                    disabled={promoting}
                    dimmed={promoting}
                    ariaLabel={promoting ? t("git.branch.promoting") : t("git.branch.promoteTooltip")}
                  >
                    {promoting ? (
                      <Loader2 size={12} strokeWidth={2} style={{ animation: "spin 1s linear infinite" }} />
                    ) : (
                      <Check size={12} strokeWidth={2} />
                    )}
                  </SquareIconButton>
                  <SquareIconButton tone="neutral" onClick={onCancelPromote} disabled={promoting}>
                    <X size={12} strokeWidth={2} />
                  </SquareIconButton>
                </span>
              </div>
              <div
                style={{
                  marginTop: 6,
                  fontSize: s(9),
                  fontFamily: "var(--font-mono)",
                  color: promoteError ? "var(--danger-soft-text)" : "color-mix(in srgb, var(--text-primary) 38%, transparent)",
                  lineHeight: 1.4,
                }}
              >
                {promoteError || (promoting ? t("git.branch.promoting") : t("git.branch.promoteHint"))}
              </div>
            </div>
          );
        }

        if (wt.path === confirmingDeletePath) {
          return (
            <div key={wt.path} style={{ padding: "8px 12px", background: "var(--danger-soft-bg)", borderRadius: 7 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <PromptText s={s} color="var(--danger-soft-text)">
                  {t("git.branch.deletePrompt", { name: label })}
                </PromptText>
                <span style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  <SquareIconButton tone="danger" onClick={onConfirmDelete}>
                    <Check size={12} strokeWidth={2} />
                  </SquareIconButton>
                  <SquareIconButton tone="neutral" onClick={onCancelDelete}>
                    <X size={12} strokeWidth={2} />
                  </SquareIconButton>
                </span>
              </div>
              {wt.branch && (
                <div
                  onClick={onToggleDeleteBranch}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    marginTop: 6,
                    fontSize: s(9),
                    fontFamily: "var(--font-mono)",
                    color: "color-mix(in srgb, var(--text-primary) 33%, transparent)",
                    cursor: "pointer",
                  }}
                >
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 14,
                      height: 14,
                      borderRadius: 3,
                      border: "1.5px solid color-mix(in srgb, var(--text-primary) 22%, transparent)",
                      background: deleteBranchToo ? "var(--danger-soft-border)" : "transparent",
                      flexShrink: 0,
                    }}
                  >
                    {deleteBranchToo && <Check size={10} strokeWidth={2.5} style={{ color: "var(--text-primary)" }} />}
                  </span>
                  {t("git.branch.alsoDeleteBranch")}
                </div>
              )}
            </div>
          );
        }

        return (
          <WorktreeRow
            key={wt.path}
            worktree={wt}
            isActive={wt.path === cwd}
            locked={locked}
            canPromote={Boolean(mainWorktree)}
            s={s}
            t={t}
            onSwitch={onSwitch}
            onRequestPromote={onRequestPromote}
            onRequestDelete={onRequestDelete}
          />
        );
      })}
      {worktrees.length === 0 && <MenuNote s={s}>{t("git.branch.noWorktreesMatch")}</MenuNote>}
    </div>
  );
}
