import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import type { GitWorktree } from "@shared/git/types";
import { useStableCallback } from "../hooks/useStableCallback";
import { NO_DRAG } from "../utils/appRegion";
import { useFontScale } from "../contexts/FontSizeContext";
import { useLocaleTranslator } from "./sidebar/useLocaleTranslator";
import { getBranchMenuPosition, getViewport, type SizedMenuPosition } from "./sidebar/dropdownPosition";
import BranchListPanel from "./git/BranchListPanel";
import { BranchCreateButton, BranchCreateForm } from "./git/BranchCreateRow";
import BranchMenuHeader from "./git/BranchMenuHeader";
import {
  buildWorktreePath,
  errorMessage,
  filterBranches,
  filterWorktrees,
  findMainWorktree,
  listLinkedWorktrees,
  type BranchMenuMode,
  type DeleteTarget,
  type PromoteTarget,
} from "./git/branchModel";
import { useBranchData } from "./git/useBranchData";
import WorktreeListPanel from "./git/WorktreeListPanel";

export interface BranchSelectorProps {
  cwd: string | null | undefined;
  /** Switch the conversation to another worktree / the main checkout. */
  onCwdChange?: (cwd: string) => void;
  /** Worktree switching is locked once the conversation has messages. */
  hasMessages?: boolean;
  onRefocusTerminal?: () => void;
  locale?: string;
}

/** Branch / worktree picker in the chat header (checkout, create, delete, promote). */
export default function BranchSelector({ cwd, onCwdChange, hasMessages = false, onRefocusTerminal, locale }: BranchSelectorProps) {
  const s = useFontScale();
  const t = useLocaleTranslator(locale);
  const { current, branches, worktrees, refresh, setCurrent, setWorktrees } = useBranchData(cwd);
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<SizedMenuPosition | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [mode, setMode] = useState<BranchMenuMode>("branch");
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<DeleteTarget | null>(null);
  const [deleteBranchToo, setDeleteBranchToo] = useState(false);
  const [confirmPromote, setConfirmPromote] = useState<PromoteTarget | null>(null);
  const [promoteError, setPromoteError] = useState<string | null>(null);
  const [promoting, setPromoting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const closeMenu = useCallback(() => {
    setOpen(false);
    setMenuStyle(null);
    setCreating(false);
    setError(null);
    setConfirmDelete(null);
    setDeleteBranchToo(false);
    setConfirmPromote(null);
    setPromoteError(null);
    setPromoting(false);
    setSearchQuery("");
  }, []);

  // Close on outside click (only listens while open).
  useEffect(() => {
    if (!open) return undefined;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target instanceof Node ? e.target : null;
      if (ref.current?.contains(target) || menuRef.current?.contains(target)) return;
      closeMenu();
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [closeMenu, open]);

  useEffect(() => {
    if (!open || creating || !searchRef.current) return undefined;
    const timer = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [creating, mode, open]);

  const updateMenuPosition = useCallback(() => {
    if (!ref.current) return;
    setMenuStyle(getBranchMenuPosition(ref.current.getBoundingClientRect(), getViewport()));
  }, []);

  useEffect(() => {
    const anchor = ref.current;
    if (!open || !anchor) return undefined;
    window.addEventListener("resize", updateMenuPosition);
    const ro = new ResizeObserver(updateMenuPosition);
    ro.observe(anchor);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      ro.disconnect();
    };
  }, [open, updateMenuPosition]);

  const mainWorktree = findMainWorktree(worktrees);

  const resetPrompts = () => {
    setConfirmDelete(null);
    setDeleteBranchToo(false);
    setError(null);
  };

  const handleCheckout = useStableCallback(async (name: string) => {
    if (!cwd || name === current) return;
    setError(null);
    try {
      await window.api.gitCheckout(cwd, name);
      setCurrent(name);
      closeMenu();
      onRefocusTerminal?.();
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name || !cwd) return;
    setError(null);
    try {
      if (mode === "worktree") {
        const wtPath = buildWorktreePath(cwd, name);
        await window.api.gitWorktreeAdd(cwd, wtPath, name);
        onCwdChange?.(wtPath);
      } else {
        await window.api.gitCreateBranch(cwd, name);
        setCurrent(name);
        onRefocusTerminal?.();
      }
      setNewName("");
      closeMenu();
      void refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const handleModeChange = (nextMode: BranchMenuMode) => {
    if (nextMode === mode) return;
    setMode(nextMode);
    setSearchQuery("");
    resetPrompts();
  };

  const handleDeleteBranch = useStableCallback(async (name: string) => {
    if (!cwd) return;
    setError(null);
    try {
      await window.api.gitDeleteBranch(cwd, name);
      setConfirmDelete(null);
      void refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  const handleDeleteWorktree = useStableCallback(async () => {
    if (!cwd || confirmDelete?.type !== "worktree") return;
    setError(null);
    try {
      await window.api.gitWorktreeRemove(cwd, confirmDelete.path);
      if (deleteBranchToo && confirmDelete.branch) {
        await window.api.gitDeleteBranch(cwd, confirmDelete.branch).catch(() => undefined);
      }
      setConfirmDelete(null);
      setDeleteBranchToo(false);
      void refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  const handlePromoteWorktree = useStableCallback(async () => {
    if (!confirmPromote || !mainWorktree) return;
    setPromoteError(null);
    setPromoting(true);
    const promoted = confirmPromote;
    try {
      const result = await window.api.gitWorktreePromote(mainWorktree.path, promoted.path, promoted.branch);
      if (!result.success) {
        setPromoteError(result.error || t("git.branch.promoteFailed"));
        setPromoting(false);
        return;
      }
      // Inside the promoted worktree? Move the conversation to the main repo.
      if (cwd === promoted.path) onCwdChange?.(mainWorktree.path);
      if (promoted.branch) setCurrent(promoted.branch);
      setWorktrees((items) => items.filter((item) => item.path !== promoted.path));
      closeMenu();
      window.setTimeout(() => void refresh(), result.cleanupPending ? 5000 : 0);
      onRefocusTerminal?.();
    } catch (e) {
      setPromoteError(errorMessage(e, t("git.branch.promoteFailed")));
      setPromoting(false);
    }
  });

  const requestBranchDelete = useStableCallback((name: string) => {
    setConfirmDelete({ type: "branch", name });
    setError(null);
  });
  const cancelDelete = useStableCallback(resetPrompts);
  const switchWorktree = useStableCallback((wt: GitWorktree) => {
    if (wt.path === cwd) return;
    onCwdChange?.(wt.path);
    closeMenu();
  });
  const selectMainWorktree = useStableCallback(() => {
    if (!mainWorktree) return;
    onCwdChange?.(mainWorktree.path);
    closeMenu();
    void refresh();
  });
  const requestPromote = useStableCallback((wt: GitWorktree) => {
    setConfirmPromote({ path: wt.path, branch: wt.branch ?? null });
    setPromoteError(null);
    setConfirmDelete(null);
    setError(null);
  });
  const cancelPromote = useStableCallback(() => {
    setConfirmPromote(null);
    setPromoteError(null);
  });
  const requestWorktreeDelete = useStableCallback((wt: GitWorktree) => {
    setConfirmDelete({ type: "worktree", path: wt.path, branch: wt.branch ?? null });
    setDeleteBranchToo(false);
    setError(null);
  });
  const toggleDeleteBranch = useStableCallback(() => setDeleteBranchToo((v) => !v));

  if (!cwd || !current) return null;

  const filteredBranches = filterBranches(branches, searchQuery);
  const filteredWorktrees = filterWorktrees(listLinkedWorktrees(worktrees, mainWorktree), searchQuery);

  const toggleOpen = () => {
    if (open) {
      closeMenu();
    } else {
      updateMenuPosition();
      setOpen(true);
      resetPrompts();
    }
    setCreating(false);
    if (!open) void refresh();
  };

  const cancelCreate = () => {
    setCreating(false);
    setNewName("");
    setError(null);
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={toggleOpen}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          padding: "4px 10px",
          background: "color-mix(in srgb, var(--control-bg) 50%, transparent)",
          border: "1px solid var(--control-bg)",
          borderRadius: 7,
          color: "var(--text-secondary)",
          fontSize: s(10),
          fontFamily: "var(--font-mono)",
          cursor: "pointer",
          transition: "all .2s",
          letterSpacing: ".04em",
          maxWidth: 220,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "color-mix(in srgb, var(--text-primary) 11%, transparent)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--control-bg)"; }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{current}</span>
        <ChevronDown size={11} strokeWidth={2} />
      </button>

      {open && menuStyle &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: "fixed",
              top: menuStyle.top,
              left: menuStyle.left,
              zIndex: 400,
              width: menuStyle.width,
              background: "var(--pane-elevated)",
              backdropFilter: "blur(48px) saturate(1.2)",
              border: "1px solid var(--pane-border)",
              borderRadius: 10,
              padding: 3,
              boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
              animation: "dropIn .15s ease",
              ...NO_DRAG,
            }}
          >
            <BranchMenuHeader
              mode={mode}
              query={searchQuery}
              searchRef={searchRef}
              s={s}
              t={t}
              onModeChange={handleModeChange}
              onQueryChange={(value) => {
                setSearchQuery(value);
                resetPrompts();
              }}
              onSearchKeyDown={(e) => {
                if (e.key !== "Escape") return;
                if (searchQuery) {
                  setSearchQuery("");
                  resetPrompts();
                } else {
                  closeMenu();
                }
              }}
            />

            {mode === "branch" ? (
              <BranchListPanel
                branches={filteredBranches}
                current={current}
                confirmingDelete={confirmDelete?.type === "branch" ? confirmDelete.name : null}
                s={s}
                t={t}
                onCheckout={handleCheckout}
                onRequestDelete={requestBranchDelete}
                onConfirmDelete={handleDeleteBranch}
                onCancelDelete={cancelDelete}
              />
            ) : (
              <WorktreeListPanel
                worktrees={filteredWorktrees}
                mainWorktree={mainWorktree}
                cwd={cwd}
                locked={hasMessages}
                confirmingDeletePath={confirmDelete?.type === "worktree" ? confirmDelete.path : null}
                deleteBranchToo={deleteBranchToo}
                promotingPath={confirmPromote?.path ?? null}
                promoting={promoting}
                promoteError={promoteError}
                s={s}
                t={t}
                onSelectMain={selectMainWorktree}
                onSwitch={switchWorktree}
                onRequestPromote={requestPromote}
                onConfirmPromote={handlePromoteWorktree}
                onCancelPromote={cancelPromote}
                onRequestDelete={requestWorktreeDelete}
                onConfirmDelete={handleDeleteWorktree}
                onCancelDelete={cancelDelete}
                onToggleDeleteBranch={toggleDeleteBranch}
              />
            )}

            {error && !creating && (
              <div style={{ fontSize: s(9), color: "var(--danger-soft-text)", padding: "4px 12px", fontFamily: "var(--font-mono)" }}>
                {error}
              </div>
            )}

            <div style={{ height: 1, background: "var(--control-bg)", margin: "3px 6px" }} />

            {creating ? (
              <BranchCreateForm
                mode={mode}
                name={newName}
                error={error}
                s={s}
                t={t}
                onNameChange={setNewName}
                onToggleMode={() => handleModeChange(mode === "worktree" ? "branch" : "worktree")}
                onSubmit={() => void handleCreate()}
                onCancel={cancelCreate}
              />
            ) : mode === "worktree" && hasMessages ? null : (
              <BranchCreateButton
                mode={mode}
                s={s}
                t={t}
                onClick={() => {
                  setCreating(true);
                  setError(null);
                  setSearchQuery("");
                }}
              />
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
