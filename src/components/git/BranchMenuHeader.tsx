import type { KeyboardEvent, Ref } from "react";
import type { BranchMenuMode } from "./branchModel";
import type { FontScale, Translator } from "../sidebar/types";

const MODES: readonly BranchMenuMode[] = ["branch", "worktree"];

export interface BranchMenuHeaderProps {
  mode: BranchMenuMode;
  query: string;
  searchRef: Ref<HTMLInputElement>;
  s: FontScale;
  t: Translator;
  onModeChange: (mode: BranchMenuMode) => void;
  onQueryChange: (query: string) => void;
  onSearchKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
}

/** Branches / Worktrees tabs and the filter input of the branch menu. */
export default function BranchMenuHeader({
  mode,
  query,
  searchRef,
  s,
  t,
  onModeChange,
  onQueryChange,
  onSearchKeyDown,
}: BranchMenuHeaderProps) {
  return (
    <>
      <div style={{ display: "flex", gap: 2, padding: "3px 3px 0", marginBottom: 2 }}>
        {MODES.map((tab) => (
          <button
            key={tab}
            onClick={() => onModeChange(tab)}
            style={{
              flex: 1,
              padding: "5px 0",
              background: mode === tab ? "var(--control-bg)" : "transparent",
              border: "none",
              borderRadius: 6,
              color:
                mode === tab
                  ? "color-mix(in srgb, var(--text-primary) 76%, transparent)"
                  : "color-mix(in srgb, var(--text-primary) 27%, transparent)",
              fontSize: s(9),
              fontFamily: "var(--font-mono)",
              letterSpacing: ".08em",
              cursor: "pointer",
              transition: "all .15s",
            }}
          >
            {tab === "branch" ? t("git.branch.branches") : t("git.branch.worktrees")}
          </button>
        ))}
      </div>

      <div style={{ padding: "6px 8px 4px" }}>
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={onSearchKeyDown}
          placeholder={mode === "worktree" ? t("git.branch.searchWorktrees") : t("git.branch.searchBranches")}
          style={{
            width: "100%",
            padding: "6px 8px",
            background: "color-mix(in srgb, var(--control-bg) 75%, transparent)",
            border: "1px solid var(--control-border)",
            borderRadius: 6,
            color: "color-mix(in srgb, var(--text-primary) 87%, transparent)",
            fontSize: s(10),
            fontFamily: "var(--font-mono)",
            outline: "none",
            boxSizing: "border-box",
          }}
        />
      </div>
    </>
  );
}
