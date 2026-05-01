import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { GitBranch, Plus, Check, X, ChevronDown, Trash2, ArrowUpFromLine } from "lucide-react";
import { useFontScale } from "../contexts/FontSizeContext";
import { createTranslator } from "../i18n";

const MENU_GAP = 6;
const VIEWPORT_PADDING = 8;

function IconActionButton({
  icon: Icon,
  tooltip,
  onClick,
  disabled = false,
  visible = true,
  hoverColor = "color-mix(in srgb, var(--text-primary) 78%, transparent)",
  baseColor = "var(--text-secondary)",
  disabledColor = "color-mix(in srgb, var(--text-primary) 13%, transparent)",
  ariaLabel,
}) {
  const btnRef = useRef(null);
  const [hovered, setHovered] = useState(false);
  const [tipPos, setTipPos] = useState(null);

  useEffect(() => {
    if (!hovered || disabled || !btnRef.current) { setTipPos(null); return; }
    const r = btnRef.current.getBoundingClientRect();
    setTipPos({ left: r.left + r.width / 2, top: r.top });
  }, [hovered, disabled]);

  const active = !disabled && visible;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={ariaLabel || tooltip}
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) onClick?.(e);
        }}
        onMouseEnter={() => { if (active) setHovered(true); }}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 22,
          height: 22,
          borderRadius: 5,
          background: "transparent",
          border: "none",
          color: disabled ? disabledColor : active && hovered ? hoverColor : baseColor,
          cursor: disabled ? "default" : "pointer",
          opacity: visible ? 1 : 0,
          pointerEvents: visible ? "auto" : "none",
          transition: "opacity .12s, color .2s",
          flexShrink: 0,
          marginLeft: 4,
          padding: 0,
        }}
      >
        <Icon size={11} strokeWidth={2} />
      </button>
      {hovered && active && tipPos && createPortal(
        <div
          role="tooltip"
          style={{
            position: "fixed",
            left: tipPos.left,
            top: tipPos.top - 6,
            transform: "translate(-50%, -100%)",
            padding: "3px 7px",
            background: "var(--app-background)",
            border: "1px solid var(--control-border)",
            borderRadius: 4,
            color: "color-mix(in srgb, var(--text-primary) 87%, transparent)",
            fontSize: 9,
            fontFamily: "var(--font-mono)",
            letterSpacing: ".04em",
            whiteSpace: "nowrap",
            pointerEvents: "none",
            zIndex: 600,
            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
          }}
        >
          {tooltip}
        </div>,
        document.body,
      )}
    </>
  );
}

export default function BranchSelector({ cwd, onCwdChange, hasMessages, onRefocusTerminal, locale }) {
  const s = useFontScale();
  const t = useMemo(() => createTranslator(locale), [locale]);
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(null);
  const [branches, setBranches] = useState([]);
  const [worktrees, setWorktrees] = useState([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [mode, setMode] = useState("branch"); // "branch" | "worktree"
  const [error, setError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null); // { type, name, path, branch }
  const [deleteBranchToo, setDeleteBranchToo] = useState(false);
  const [confirmPromote, setConfirmPromote] = useState(null); // { path, branch }
  const [promoteError, setPromoteError] = useState(null);
  const [promoting, setPromoting] = useState(false);
  const [hoveredRow, setHoveredRow] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const ref = useRef(null);
  const menuRef = useRef(null);
  const inputRef = useRef(null);
  const searchRef = useRef(null);
  const [menuStyle, setMenuStyle] = useState(null);

  const refresh = useCallback(async () => {
    if (!cwd || !window.api) return;
    try {
      const [b, w] = await Promise.all([
        window.api.gitBranches(cwd),
        window.api.gitWorktreeList(cwd),
      ]);
      setCurrent(b.current);
      setBranches(b.branches);
      setWorktrees(w);
    } catch (refreshError) {
      void refreshError;
    }
  }, [cwd]);

  useEffect(() => {
    const refreshTimer = window.setTimeout(() => {
      refresh();
    }, 0);
    return () => window.clearTimeout(refreshTimer);
  }, [refresh]);

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
    setHoveredRow(null);
    setSearchQuery("");
  }, []);

  // Close on outside click
  useEffect(() => {
    const h = (e) => {
      if (ref.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
      closeMenu();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [closeMenu]);

  // Focus input when creating
  useEffect(() => {
    if (creating && inputRef.current) inputRef.current.focus();
  }, [creating]);

  useEffect(() => {
    if (!open || creating || !searchRef.current) return;
    const timer = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [creating, mode, open]);

  const handleCheckout = async (name) => {
    if (!cwd || name === current) return;
    setError(null);
    try {
      await window.api.gitCheckout(cwd, name);
      setCurrent(name);
      closeMenu();
      onRefocusTerminal?.();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name || !cwd) return;
    setError(null);
    try {
      if (mode === "worktree") {
        // Create worktree in dedicated .worktrees/ directory
        const basePath = cwd.replace(/\/$/, "");
        const wtPath = `${basePath}/.worktrees/${name}`;
        await window.api.gitWorktreeAdd(cwd, wtPath, name);
        if (onCwdChange) onCwdChange(wtPath);
      } else {
        await window.api.gitCreateBranch(cwd, name);
        setCurrent(name);
        onRefocusTerminal?.();
      }
      setNewName("");
      closeMenu();
      refresh();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleWorktreeSwitch = (wt) => {
    if (wt.path === cwd) return;
    if (onCwdChange) onCwdChange(wt.path);
    closeMenu();
  };

  const handleModeChange = (nextMode) => {
    if (nextMode === mode) return;
    setMode(nextMode);
    setSearchQuery("");
    setConfirmDelete(null);
    setDeleteBranchToo(false);
    setHoveredRow(null);
    setError(null);
  };

  const updateMenuPosition = useCallback(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const width = Math.min(320, Math.max(240, rect.width + 24));
    const alignRight = rect.left + width > window.innerWidth - VIEWPORT_PADDING;
    const left = alignRight
      ? Math.max(VIEWPORT_PADDING, rect.right - width)
      : Math.min(rect.left, window.innerWidth - width - VIEWPORT_PADDING);
    setMenuStyle({
      top: rect.bottom + MENU_GAP,
      left,
      width,
    });
  }, []);

  useEffect(() => {
    if (!open || !ref.current) return;
    const handleResize = () => updateMenuPosition();
    window.addEventListener("resize", handleResize);
    const ro = new ResizeObserver(handleResize);
    ro.observe(ref.current);
    return () => {
      window.removeEventListener("resize", handleResize);
      ro.disconnect();
    };
  }, [open, updateMenuPosition]);

  const PROTECTED_BRANCHES = ["main", "master"];

  const handleDeleteBranch = async (name) => {
    setError(null);
    try {
      await window.api.gitDeleteBranch(cwd, name);
      setConfirmDelete(null);
      refresh();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleDeleteWorktree = async () => {
    if (!confirmDelete) return;
    setError(null);
    try {
      await window.api.gitWorktreeRemove(cwd, confirmDelete.path);
      if (deleteBranchToo && confirmDelete.branch) {
        try {
          await window.api.gitDeleteBranch(cwd, confirmDelete.branch);
        } catch (deleteBranchError) {
          void deleteBranchError;
        }
      }
      setConfirmDelete(null);
      setDeleteBranchToo(false);
      refresh();
    } catch (e) {
      setError(e.message);
    }
  };

  const handlePromoteWorktree = async () => {
    if (!confirmPromote || !mainWorktree) return;
    setPromoteError(null);
    setPromoting(true);
    try {
      const result = await window.api.gitWorktreePromote(
        mainWorktree.path,
        confirmPromote.path,
        confirmPromote.branch || null,
      );
      if (!result?.success) {
        setPromoteError(result?.error || t("git.branch.promoteFailed"));
        setPromoting(false);
        return;
      }
      // If the user was inside the worktree being promoted, switch them to the main repo.
      if (cwd === confirmPromote.path && onCwdChange) {
        onCwdChange(mainWorktree.path);
      }
      setConfirmPromote(null);
      setPromoting(false);
      refresh();
      onRefocusTerminal?.();
    } catch (e) {
      setPromoteError(e.message || t("git.branch.promoteFailed"));
      setPromoting(false);
    }
  };

  if (!cwd || !current) return null;

  // Find the main worktree (first one is always the main repo)
  const mainWorktree = worktrees.find((w) => !w.bare) || null;
  const isInWorktree = mainWorktree && cwd !== mainWorktree.path;

  // Worktree switching is disabled mid-conversation
  const worktreeLocked = hasMessages;
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredBranches = normalizedQuery
    ? branches.filter((branch) => branch.toLowerCase().includes(normalizedQuery))
    : branches;
  const listedWorktrees = worktrees.filter((w) => !w.bare && w.path !== mainWorktree?.path);
  const filteredWorktrees = normalizedQuery
    ? listedWorktrees.filter((wt) => {
      const name = wt.path.split("/").pop() || "";
      return name.toLowerCase().includes(normalizedQuery)
        || wt.path.toLowerCase().includes(normalizedQuery)
        || (wt.branch || "").toLowerCase().includes(normalizedQuery);
    })
    : listedWorktrees;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => {
          if (open) {
            closeMenu();
          } else {
            updateMenuPosition();
            setOpen(true);
            setError(null);
            setConfirmDelete(null);
            setDeleteBranchToo(false);
            setHoveredRow(null);
          }
          setCreating(false);
          if (!open) refresh();
        }}
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
        <span style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {current}
        </span>
        <ChevronDown size={11} strokeWidth={2} />
      </button>

      {open && menuStyle && createPortal(
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
            WebkitAppRegion: "no-drag",
          }}
        >
          {/* Tab: Branches / Worktrees */}
          <div style={{
            display: "flex",
            gap: 2,
            padding: "3px 3px 0",
            marginBottom: 2,
          }}>
            {["branch", "worktree"].map((tab) => (
              <button
                key={tab}
                onClick={() => handleModeChange(tab)}
                style={{
                  flex: 1,
                  padding: "5px 0",
                  background: mode === tab ? "var(--control-bg)" : "transparent",
                  border: "none",
                  borderRadius: 6,
                  color: mode === tab ? "color-mix(in srgb, var(--text-primary) 76%, transparent)" : "color-mix(in srgb, var(--text-primary) 27%, transparent)",
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
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setConfirmDelete(null);
                setDeleteBranchToo(false);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  if (searchQuery) {
                    setSearchQuery("");
                    setConfirmDelete(null);
                    setDeleteBranchToo(false);
                    setError(null);
                  } else {
                    closeMenu();
                  }
                }
              }}
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

          {/* Branch list */}
          {mode === "branch" && (
            <div style={{ maxHeight: 240, overflowY: "auto" }}>
              {filteredBranches.map((b) => {
                const isProtected = b === current || PROTECTED_BRANCHES.includes(b);
                const isConfirming = confirmDelete?.type === "branch" && confirmDelete.name === b;

                if (isConfirming) {
                  return (
                    <div key={b} style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      width: "100%",
                      padding: "8px 12px",
                      background: "var(--danger-soft-bg)",
                      borderRadius: 7,
                      gap: 8,
                    }}>
                      <span style={{
                        fontSize: s(10),
                        fontFamily: "var(--font-mono)",
                        color: "var(--danger-soft-text)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}>{t("git.branch.deletePrompt", { name: b })}</span>
                      <span style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                        <button
                          onClick={() => handleDeleteBranch(b)}
                          style={{
                            display: "flex", alignItems: "center", justifyContent: "center",
                            width: 24, height: 24, borderRadius: 6,
                            background: "var(--danger-soft-bg)", border: "none",
                            color: "var(--danger-soft-text)", cursor: "pointer",
                          }}
                        ><Check size={12} strokeWidth={2} /></button>
                        <button
                          onClick={() => { setConfirmDelete(null); setError(null); }}
                          style={{
                            display: "flex", alignItems: "center", justifyContent: "center",
                            width: 24, height: 24, borderRadius: 6,
                            background: "color-mix(in srgb, var(--control-bg) 50%, transparent)", border: "none",
                            color: "color-mix(in srgb, var(--text-primary) 33%, transparent)", cursor: "pointer",
                          }}
                        ><X size={12} strokeWidth={2} /></button>
                      </span>
                    </div>
                  );
                }

                return (
                  <div
                    key={b}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      width: "100%",
                      padding: "8px 12px",
                      background: b === current ? "var(--control-bg)" : hoveredRow === `branch-${b}` ? "color-mix(in srgb, var(--control-bg) 63%, transparent)" : "transparent",
                      borderRadius: 7,
                      transition: "all .12s",
                    }}
                    onMouseEnter={() => setHoveredRow(`branch-${b}`)}
                    onMouseLeave={() => setHoveredRow(null)}
                  >
                    <button
                      onClick={() => handleCheckout(b)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        flex: 1,
                        minWidth: 0,
                        background: "none",
                        border: "none",
                        color: b === current ? "var(--text-primary)" : "color-mix(in srgb, var(--text-primary) 43%, transparent)",
                        fontSize: s(11),
                        fontFamily: "var(--font-mono)",
                        cursor: "pointer",
                        textAlign: "left",
                        padding: 0,
                      }}
                    >
                      <span style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}>{b}</span>
                    </button>
                    {b === current && <Check size={12} strokeWidth={2} style={{ opacity: 0.5, flexShrink: 0 }} />}
                    {!isProtected && (
                      <IconActionButton
                        icon={Trash2}
                        tooltip={t("git.branch.deleteTooltip")}
                        visible={hoveredRow === `branch-${b}`}
                        onClick={() => { setConfirmDelete({ type: "branch", name: b }); setError(null); }}
                      />
                    )}
                  </div>
                );
              })}
              {filteredBranches.length === 0 && (
                <div style={{
                  padding: "10px 12px",
                  fontSize: s(9),
                  fontFamily: "var(--font-mono)",
                  color: "color-mix(in srgb, var(--text-primary) 27%, transparent)",
                }}>
                  {t("git.branch.noBranchesMatch")}
                </div>
              )}
            </div>
          )}

          {/* Worktree list */}
          {mode === "worktree" && (
            <div style={{ maxHeight: 240, overflowY: "auto" }}>
              {worktreeLocked && (
                <div style={{
                  padding: "6px 12px",
                  fontSize: s(9),
                  fontFamily: "var(--font-mono)",
                  color: "color-mix(in srgb, var(--text-primary) 27%, transparent)",
                  letterSpacing: ".04em",
                }}>
                  {t("git.branch.startNewChatToSwitch")}
                </div>
              )}
              {/* None option — use main repo directly */}
              {mainWorktree && (
                <button
                  onClick={() => {
                    if (worktreeLocked || !isInWorktree) return;
                    onCwdChange?.(mainWorktree.path);
                    closeMenu();
                    refresh();
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                    padding: "8px 12px",
                    background: !isInWorktree ? "var(--control-bg)" : "transparent",
                    border: "none",
                    borderRadius: 7,
                    color: !isInWorktree ? "var(--text-primary)" : worktreeLocked ? "color-mix(in srgb, var(--text-primary) 16%, transparent)" : "color-mix(in srgb, var(--text-primary) 43%, transparent)",
                    fontSize: s(11),
                    fontFamily: "var(--font-mono)",
                    cursor: worktreeLocked && isInWorktree ? "default" : "pointer",
                    textAlign: "left",
                    transition: "all .12s",
                  }}
                  onMouseEnter={(e) => { if (!worktreeLocked && isInWorktree) e.currentTarget.style.background = "color-mix(in srgb, var(--control-bg) 63%, transparent)"; }}
                  onMouseLeave={(e) => { if (isInWorktree) e.currentTarget.style.background = "transparent"; }}
                >
                  <span>{t("git.branch.none")}</span>
                  {!isInWorktree && <Check size={12} strokeWidth={2} style={{ opacity: 0.5, flexShrink: 0 }} />}
                </button>
              )}
              {filteredWorktrees.map((wt) => {
                const isActive = wt.path === cwd;
                const isConfirming = confirmDelete?.type === "worktree" && confirmDelete.path === wt.path;
                const isPromoting = confirmPromote?.path === wt.path;

                if (isPromoting) {
                  return (
                    <div key={wt.path} style={{
                      padding: "8px 12px",
                      background: "var(--badge-open-bg)",
                      borderRadius: 7,
                    }}>
                      <div style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                      }}>
                        <span style={{
                          fontSize: s(10),
                          fontFamily: "var(--font-mono)",
                          color: "var(--badge-open-text)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}>{t("git.branch.promotePrompt", { name: wt.branch || t("git.branch.worktreeLabel") })}</span>
                        <span style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                          <button
                            onClick={handlePromoteWorktree}
                            disabled={promoting}
                            style={{
                              display: "flex", alignItems: "center", justifyContent: "center",
                              width: 24, height: 24, borderRadius: 6,
                              background: "var(--badge-open-bg)", border: "none",
                              color: "var(--badge-open-text)",
                              cursor: promoting ? "default" : "pointer",
                              opacity: promoting ? 0.5 : 1,
                            }}
                          ><Check size={12} strokeWidth={2} /></button>
                          <button
                            onClick={() => { setConfirmPromote(null); setPromoteError(null); }}
                            disabled={promoting}
                            style={{
                              display: "flex", alignItems: "center", justifyContent: "center",
                              width: 24, height: 24, borderRadius: 6,
                              background: "color-mix(in srgb, var(--control-bg) 50%, transparent)", border: "none",
                              color: "color-mix(in srgb, var(--text-primary) 33%, transparent)",
                              cursor: promoting ? "default" : "pointer",
                            }}
                          ><X size={12} strokeWidth={2} /></button>
                        </span>
                      </div>
                      <div style={{
                        marginTop: 6,
                        fontSize: s(9),
                        fontFamily: "var(--font-mono)",
                        color: promoteError ? "var(--danger-soft-text)" : "color-mix(in srgb, var(--text-primary) 38%, transparent)",
                        lineHeight: 1.4,
                      }}>
                        {promoteError
                          ? promoteError
                          : t("git.branch.promoteHint")}
                      </div>
                    </div>
                  );
                }

                if (isConfirming) {
                  return (
                    <div key={wt.path} style={{
                      padding: "8px 12px",
                      background: "var(--danger-soft-bg)",
                      borderRadius: 7,
                    }}>
                      <div style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                      }}>
                        <span style={{
                          fontSize: s(10),
                          fontFamily: "var(--font-mono)",
                          color: "var(--danger-soft-text)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}>{t("git.branch.deletePrompt", { name: wt.branch || t("git.branch.worktreeLabel") })}</span>
                        <span style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                          <button
                            onClick={handleDeleteWorktree}
                            style={{
                              display: "flex", alignItems: "center", justifyContent: "center",
                              width: 24, height: 24, borderRadius: 6,
                              background: "var(--danger-soft-bg)", border: "none",
                              color: "var(--danger-soft-text)", cursor: "pointer",
                            }}
                          ><Check size={12} strokeWidth={2} /></button>
                          <button
                            onClick={() => { setConfirmDelete(null); setDeleteBranchToo(false); setError(null); }}
                            style={{
                              display: "flex", alignItems: "center", justifyContent: "center",
                              width: 24, height: 24, borderRadius: 6,
                              background: "color-mix(in srgb, var(--control-bg) 50%, transparent)", border: "none",
                              color: "color-mix(in srgb, var(--text-primary) 33%, transparent)", cursor: "pointer",
                            }}
                          ><X size={12} strokeWidth={2} /></button>
                        </span>
                      </div>
                      {wt.branch && (
                        <div
                          onClick={() => setDeleteBranchToo(!deleteBranchToo)}
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
                          <span style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 14,
                            height: 14,
                            borderRadius: 3,
                            border: "1.5px solid color-mix(in srgb, var(--text-primary) 22%, transparent)",
                            background: deleteBranchToo ? "var(--danger-soft-border)" : "transparent",
                            flexShrink: 0,
                          }}>
                            {deleteBranchToo && <Check size={10} strokeWidth={2.5} style={{ color: "var(--text-primary)" }} />}
                          </span>
                          {t("git.branch.alsoDeleteBranch")}
                        </div>
                      )}
                    </div>
                  );
                }

                return (
                  <div
                    key={wt.path}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      width: "100%",
                      padding: "8px 12px",
                      background: isActive ? "var(--control-bg)" : hoveredRow === `wt-${wt.path}` ? "color-mix(in srgb, var(--control-bg) 63%, transparent)" : "transparent",
                      borderRadius: 7,
                      transition: "all .12s",
                    }}
                    onMouseEnter={() => setHoveredRow(`wt-${wt.path}`)}
                    onMouseLeave={() => setHoveredRow(null)}
                  >
                    <button
                      onClick={() => !worktreeLocked && handleWorktreeSwitch(wt)}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-start",
                        flex: 1,
                        minWidth: 0,
                        background: "none",
                        border: "none",
                        color: isActive ? "var(--text-primary)" : worktreeLocked ? "color-mix(in srgb, var(--text-primary) 16%, transparent)" : "color-mix(in srgb, var(--text-primary) 43%, transparent)",
                        fontSize: s(11),
                        fontFamily: "var(--font-mono)",
                        cursor: worktreeLocked && !isActive ? "default" : "pointer",
                        textAlign: "left",
                        padding: 0,
                        gap: 2,
                      }}
                    >
                      <span style={{ display: "flex", alignItems: "center", width: "100%", gap: 6 }}>
                        <span>{wt.path.split("/").pop()}</span>
                        {isActive && <Check size={12} strokeWidth={2} style={{ opacity: 0.5, flexShrink: 0 }} />}
                      </span>
                      <span style={{
                        fontSize: s(8),
                        color: "color-mix(in srgb, var(--text-primary) 22%, transparent)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        maxWidth: "100%",
                      }}>
                        {wt.branch || t("git.branch.detached")}
                      </span>
                    </button>
                    {mainWorktree && (
                      <IconActionButton
                        icon={ArrowUpFromLine}
                        tooltip={t("git.branch.promoteTooltip")}
                        visible={hoveredRow === `wt-${wt.path}`}
                        onClick={() => {
                          setConfirmPromote({ path: wt.path, branch: wt.branch });
                          setPromoteError(null);
                          setConfirmDelete(null);
                          setError(null);
                        }}
                      />
                    )}
                    {!isActive && (
                      <IconActionButton
                        icon={Trash2}
                        tooltip={t("git.branch.deleteTooltip")}
                        visible={hoveredRow === `wt-${wt.path}`}
                        onClick={() => { setConfirmDelete({ type: "worktree", path: wt.path, branch: wt.branch }); setDeleteBranchToo(false); setError(null); }}
                      />
                    )}
                  </div>
                );
              })}
              {filteredWorktrees.length === 0 && (
                <div style={{
                  padding: "10px 12px",
                  fontSize: s(9),
                  fontFamily: "var(--font-mono)",
                  color: "color-mix(in srgb, var(--text-primary) 27%, transparent)",
                }}>
                  {t("git.branch.noWorktreesMatch")}
                </div>
              )}
            </div>
          )}

          {error && !creating && (
            <div style={{
              fontSize: s(9),
              color: "var(--danger-soft-text)",
              padding: "4px 12px",
              fontFamily: "var(--font-mono)",
            }}>
              {error}
            </div>
          )}

          {/* Divider + create */}
          <div style={{ height: 1, background: "var(--control-bg)", margin: "3px 6px" }} />

          {creating ? (
            <div style={{ padding: "6px 8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
                {/* Toggle: branch vs worktree */}
                <button
                  onClick={() => handleModeChange(mode === "worktree" ? "branch" : "worktree")}
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
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                    if (e.key === "Escape") { setCreating(false); setNewName(""); setError(null); }
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
                  onClick={handleCreate}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 24,
                    height: 24,
                    borderRadius: 6,
                    background: newName.trim() ? "var(--badge-open-bg)" : "color-mix(in srgb, var(--control-bg) 50%, transparent)",
                    border: "none",
                    color: newName.trim() ? "var(--badge-open-text)" : "color-mix(in srgb, var(--text-primary) 16%, transparent)",
                    cursor: newName.trim() ? "pointer" : "default",
                    flexShrink: 0,
                  }}
                >
                  <Check size={12} strokeWidth={2} />
                </button>
                <button
                  onClick={() => { setCreating(false); setNewName(""); setError(null); }}
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
                <div style={{
                  fontSize: s(9),
                  color: "var(--danger-soft-text)",
                  padding: "2px 4px",
                  fontFamily: "var(--font-mono)",
                }}>
                  {error}
                </div>
              )}
            </div>
          ) : (mode === "worktree" && hasMessages) ? null : (
            <button
              onClick={() => { setCreating(true); setError(null); setSearchQuery(""); }}
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
              onMouseEnter={(e) => { e.currentTarget.style.background = "color-mix(in srgb, var(--control-bg) 63%, transparent)"; e.currentTarget.style.color = "color-mix(in srgb, var(--text-primary) 54%, transparent)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "color-mix(in srgb, var(--text-primary) 33%, transparent)"; }}
            >
              <Plus size={12} strokeWidth={2} />
              {mode === "worktree" ? t("git.branch.newWorktree") : t("git.branch.newBranch")}
            </button>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
