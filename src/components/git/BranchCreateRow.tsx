import { useEffect, useRef } from "react";
import { Check, Plus, X } from "lucide-react";
import type { BranchMenuMode } from "./branchModel";
import type { FontScale, Translator } from "../sidebar/types";

export interface BranchCreateFormProps {
  mode: BranchMenuMode;
  name: string;
  error: string | null;
  s: FontScale;
  t: Translator;
  onNameChange: (name: string) => void;
  onToggleMode: () => void;
  onSubmit: () => void;
  onCancel: () => void;
}

/** Inline "new branch / new worktree" form (focused on mount). */
export function BranchCreateForm({ mode, name, error, s, t, onNameChange, onToggleMode, onSubmit, onCancel }: BranchCreateFormProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  const hasName = name.trim().length > 0;

  return (
    <div style={{ padding: "6px 8px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
        <button
          onClick={onToggleMode}
          style={{
            padding: "3px 7px",
            background: "var(--control-bg)",
            border: "1px solid var(--pane-border)",
            borderRadius: 5,
            color: "color-mix(in srgb, var(--text-primary) 43%, transparent)",
            fontSize: s(8),
            fontFamily: "var(--font-mono)",
            letterSpacing: ".06em",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          {mode === "worktree" ? t("git.branch.worktreeModeLabel") : t("git.branch.branchModeLabel")}
        </button>
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSubmit();
            if (e.key === "Escape") onCancel();
          }}
          placeholder={mode === "worktree" ? t("git.branch.worktreeNamePlaceholder") : t("git.branch.branchNamePlaceholder")}
          style={{
            flex: 1,
            padding: "5px 8px",
            background: "color-mix(in srgb, var(--control-bg) 75%, transparent)",
            border: "1px solid var(--control-border)",
            borderRadius: 6,
            color: "color-mix(in srgb, var(--text-primary) 87%, transparent)",
            fontSize: s(10),
            fontFamily: "var(--font-mono)",
            outline: "none",
            minWidth: 0,
          }}
        />
        <button
          onClick={onSubmit}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 24,
            height: 24,
            borderRadius: 6,
            background: hasName ? "var(--badge-open-bg)" : "color-mix(in srgb, var(--control-bg) 50%, transparent)",
            border: "none",
            color: hasName ? "var(--badge-open-text)" : "color-mix(in srgb, var(--text-primary) 16%, transparent)",
            cursor: hasName ? "pointer" : "default",
            flexShrink: 0,
          }}
        >
          <Check size={12} strokeWidth={2} />
        </button>
        <button
          onClick={onCancel}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 24,
            height: 24,
            borderRadius: 6,
            background: "color-mix(in srgb, var(--control-bg) 50%, transparent)",
            border: "none",
            color: "color-mix(in srgb, var(--text-primary) 33%, transparent)",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <X size={12} strokeWidth={2} />
        </button>
      </div>
      {error && (
        <div style={{ fontSize: s(9), color: "var(--danger-soft-text)", padding: "2px 4px", fontFamily: "var(--font-mono)" }}>
          {error}
        </div>
      )}
    </div>
  );
}

/** "+ New branch / New worktree" entry that opens the create form. */
export function BranchCreateButton({ mode, s, t, onClick }: { mode: BranchMenuMode; s: FontScale; t: Translator; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        width: "100%",
        padding: "8px 12px",
        background: "transparent",
        border: "none",
        borderRadius: 7,
        color: "color-mix(in srgb, var(--text-primary) 33%, transparent)",
        fontSize: s(10),
        fontFamily: "var(--font-mono)",
        cursor: "pointer",
        transition: "all .12s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "color-mix(in srgb, var(--control-bg) 63%, transparent)";
        e.currentTarget.style.color = "color-mix(in srgb, var(--text-primary) 54%, transparent)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = "color-mix(in srgb, var(--text-primary) 33%, transparent)";
      }}
    >
      <Plus size={12} strokeWidth={2} />
      {mode === "worktree" ? t("git.branch.newWorktree") : t("git.branch.newBranch")}
    </button>
  );
}
