import { forwardRef, useState, type RefObject } from "react";
import type { GhIssue } from "@shared/github/types";
import type { FontScale } from "../../contexts/FontSizeContext";
import type { Translator } from "../../i18n";
import FloatingSheet from "./FloatingSheet";
import { findExactBranch } from "./newChat";
import { isPlainEnter, neutralItemStyle, sheetInputStyle, sheetNoticeStyle, sheetRowHover } from "./styles";
import { useFloatingLayout } from "./useFloatingLayout";

interface SheetBaseProps {
  anchorRef: RefObject<HTMLElement | null>;
  s: FontScale;
  t: Translator;
  onClose: () => void;
}

/* ── Issue search ──────────────────────────────────────────────── */

export interface IssueSearchDropdownProps extends SheetBaseProps {
  query: string;
  onQueryChange: (query: string) => void;
  issues: readonly GhIssue[];
  loading: boolean;
  onSelect: (issue: GhIssue) => void;
}

export const IssueSearchDropdown = forwardRef<HTMLDivElement, IssueSearchDropdownProps>(function IssueSearchDropdown(
  { anchorRef, s, t, onClose, query, onQueryChange, issues, loading, onSelect },
  ref,
) {
  const layout = useFloatingLayout(anchorRef, 340, 300);
  if (!layout) return null;

  return (
    <FloatingSheet ref={ref} layout={layout} anchorRef={anchorRef} onClose={onClose}>
      <input
        autoFocus
        type="text"
        placeholder={t("newChat.searchIssues")}
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        style={sheetInputStyle(s)}
      />
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {loading && <div style={sheetNoticeStyle(s)}>{t("newChat.loading")}</div>}
        {!loading && issues.length === 0 && <div style={sheetNoticeStyle(s)}>{t("newChat.noIssuesFound")}</div>}
        {issues.map((issue) => (
          <button
            key={issue.number}
            onClick={() => onSelect(issue)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              width: "100%",
              padding: "8px 10px",
              background: "transparent",
              border: "none",
              borderRadius: 7,
              color: "var(--text-secondary)",
              fontSize: s(11),
              fontFamily: "var(--font-ui)",
              cursor: "pointer",
              textAlign: "left",
              transition: "all .12s",
            }}
            {...sheetRowHover}
          >
            <span style={{ fontSize: s(9), fontFamily: "var(--font-mono)", color: "var(--text-muted)", flexShrink: 0 }}>
              #{issue.number}
            </span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{issue.title}</span>
          </button>
        ))}
      </div>
    </FloatingSheet>
  );
});

/* ── Branch search ─────────────────────────────────────────────── */

export interface BranchSearchDropdownProps extends SheetBaseProps {
  query: string;
  onQueryChange: (query: string) => void;
  branches: readonly string[];
  loading: boolean;
  currentBranch: string;
  /** Worktree mode: only existing branches can be picked (as the base). */
  worktree: boolean;
  onSelectBranch: (name: string) => void;
  onUseCustomBranch: (name: string) => void;
}

export const BranchSearchDropdown = forwardRef<HTMLDivElement, BranchSearchDropdownProps>(function BranchSearchDropdown(
  { anchorRef, s, t, onClose, query, onQueryChange, branches, loading, currentBranch, worktree, onSelectBranch, onUseCustomBranch },
  ref,
) {
  const layout = useFloatingLayout(anchorRef, 360, 320);
  const trimmedQuery = query.trim();
  const exactBranchName = findExactBranch(branches, trimmedQuery);
  if (!layout) return null;

  return (
    <FloatingSheet ref={ref} layout={layout} anchorRef={anchorRef} onClose={onClose}>
      <input
        autoFocus
        type="text"
        placeholder={worktree ? t("newChat.pickBaseBranch") : t("newChat.findOrTypeBranch")}
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (isPlainEnter(e) && trimmedQuery) {
            e.preventDefault();
            if (exactBranchName) onSelectBranch(exactBranchName);
            else if (!worktree) onUseCustomBranch(trimmedQuery);
          }
        }}
        style={sheetInputStyle(s)}
      />

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {trimmedQuery && !exactBranchName && !worktree && (
          <button
            onClick={() => onUseCustomBranch(trimmedQuery)}
            style={{ ...neutralItemStyle(s), padding: "9px 10px", color: "var(--accent-text)", transition: undefined }}
            {...sheetRowHover}
          >
            {t("newChat.useAsNewBranch", { value: trimmedQuery })}
          </button>
        )}

        {loading && <div style={sheetNoticeStyle(s)}>{t("newChat.loading")}</div>}
        {!loading && branches.length === 0 && <div style={sheetNoticeStyle(s)}>{t("newChat.noBranchesFound")}</div>}

        {branches.map((branchName) => (
          <button
            key={branchName}
            onClick={() => onSelectBranch(branchName)}
            style={{
              ...neutralItemStyle(s),
              flexDirection: "column",
              alignItems: "flex-start",
              gap: 2,
              color: branchName === currentBranch ? "var(--text-primary)" : "var(--text-secondary)",
            }}
            {...sheetRowHover}
          >
            <span>{branchName}</span>
            {branchName === currentBranch && (
              <span style={{ fontSize: s(8.5), color: "var(--text-faint)", letterSpacing: ".04em" }}>
                {t("newChat.currentBranch")}
              </span>
            )}
          </button>
        ))}
      </div>
    </FloatingSheet>
  );
});

/* ── Worktree name ─────────────────────────────────────────────── */

export interface WorktreeInputDropdownProps extends SheetBaseProps {
  initialValue: string;
  /** A worktree is already enabled (offer "turn off"). */
  active: boolean;
  baseBranch: string;
  onConfirm: (name: string) => void;
  onDisable: () => void;
}

export const WorktreeInputDropdown = forwardRef<HTMLDivElement, WorktreeInputDropdownProps>(function WorktreeInputDropdown(
  { anchorRef, s, t, onClose, initialValue, active, baseBranch, onConfirm, onDisable },
  ref,
) {
  const layout = useFloatingLayout(anchorRef, 300, 180);
  const [value, setValue] = useState(initialValue);
  if (!layout) return null;
  const trimmed = value.trim();

  return (
    <FloatingSheet ref={ref} layout={layout} anchorRef={anchorRef} onClose={onClose} limitHeight={false}>
      <input
        autoFocus
        type="text"
        placeholder={t("newChat.worktreeNamePlaceholder")}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (isPlainEnter(e)) {
            e.preventDefault();
            onConfirm(value);
          }
        }}
        style={sheetInputStyle(s)}
      />

      {baseBranch && (
        <div style={{ padding: "6px 10px 2px", fontSize: s(9), fontFamily: "var(--font-mono)", color: "var(--text-muted)", letterSpacing: ".04em" }}>
          {t("newChat.worktreeFrom", { value: baseBranch })}
        </div>
      )}

      <button onClick={() => onConfirm(value)} style={neutralItemStyle(s)} {...sheetRowHover}>
        {trimmed ? t("newChat.useNamedWorktree", { value: trimmed }) : t("newChat.useRandomWorktree")}
      </button>

      {active && (
        <button onClick={onDisable} style={neutralItemStyle(s)} {...sheetRowHover}>
          {t("newChat.turnOffWorktree")}
        </button>
      )}
    </FloatingSheet>
  );
});
