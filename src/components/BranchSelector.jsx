import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { GitBranch, Plus, Check, X, ChevronDown, Trash2 } from "lucide-react";
import { useFontScale } from "../contexts/FontSizeContext";

const MENU_GAP = 6;
const VIEWPORT_PADDING = 8;

export default function BranchSelector({ cwd, onCwdChange, hasMessages, onRefocusTerminal }) {
  const s = useFontScale();
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
  const [hoveredRow, setHoveredRow] = useState(null);
  const ref = useRef(null);
  const menuRef = useRef(null);
  const inputRef = useRef(null);
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

  // Close on outside click
  useEffect(() => {
    const h = (e) => {
      if (ref.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
      setOpen(false);
      setMenuStyle(null);
      setCreating(false);
      setError(null);
      setConfirmDelete(null);
      setDeleteBranchToo(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // Focus input when creating
  useEffect(() => {
    if (creating && inputRef.current) inputRef.current.focus();
  }, [creating]);

  const handleCheckout = async (name) => {
    if (!cwd || name === current) return;
    setError(null);
    try {
      await window.api.gitCheckout(cwd, name);
      setCurrent(name);
      setMenuStyle(null);
      setOpen(false);
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
      setCreating(false);
      setMenuStyle(null);
      setOpen(false);
      refresh();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleWorktreeSwitch = (wt) => {
    if (wt.path === cwd) return;
    if (onCwdChange) onCwdChange(wt.path);
    setMenuStyle(null);
    setOpen(false);
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

  if (!cwd || !current) return null;

  // Find the main worktree (first one is always the main repo)
  const mainWorktree = worktrees.find((w) => !w.bare) || null;
  const isInWorktree = mainWorktree && cwd !== mainWorktree.path;

  // Worktree switching is disabled mid-conversation
  const worktreeLocked = hasMessages;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => {
          if (open) {
            setOpen(false);
            setMenuStyle(null);
          } else {
            updateMenuPosition();
            setOpen(true);
          }
          setCreating(false);
          setError(null);
          if (!open) refresh();
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          padding: "4px 10px",
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.04)",
          borderRadius: 7,
          color: "rgba(255,255,255,0.4)",
          fontSize: s(10),
          fontFamily: "'JetBrains Mono',monospace",
          cursor: "pointer",
          transition: "all .2s",
          letterSpacing: ".04em",
          maxWidth: 220,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.04)"; }}
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
            background: "rgba(8,8,12,0.55)",
            backdropFilter: "blur(48px) saturate(1.2)",
            border: "1px solid rgba(255,255,255,0.06)",
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
            {["branch", "worktree"].map((t) => (
              <button
                key={t}
                onClick={() => setMode(t)}
                style={{
                  flex: 1,
                  padding: "5px 0",
                  background: mode === t ? "rgba(255,255,255,0.04)" : "transparent",
                  border: "none",
                  borderRadius: 6,
                  color: mode === t ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.25)",
                  fontSize: s(9),
                  fontFamily: "'JetBrains Mono',monospace",
                  letterSpacing: ".08em",
                  cursor: "pointer",
                  transition: "all .15s",
                }}
              >
                {t === "branch" ? "BRANCHES" : "WORKTREES"}
              </button>
            ))}
          </div>

          {/* Branch list */}
          {mode === "branch" && (
            <div style={{ maxHeight: 240, overflowY: "auto" }}>
              {branches.map((b) => {
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
                      background: "rgba(255,180,180,0.06)",
                      borderRadius: 7,
                      gap: 8,
                    }}>
                      <span style={{
                        fontSize: s(10),
                        fontFamily: "'JetBrains Mono',monospace",
                        color: "rgba(255,180,180,0.7)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}>Delete {b}?</span>
                      <span style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                        <button
                          onClick={() => handleDeleteBranch(b)}
                          style={{
                            display: "flex", alignItems: "center", justifyContent: "center",
                            width: 24, height: 24, borderRadius: 6,
                            background: "rgba(255,180,180,0.12)", border: "none",
                            color: "rgba(255,180,180,0.7)", cursor: "pointer",
                          }}
                        ><Check size={12} strokeWidth={2} /></button>
                        <button
                          onClick={() => { setConfirmDelete(null); setError(null); }}
                          style={{
                            display: "flex", alignItems: "center", justifyContent: "center",
                            width: 24, height: 24, borderRadius: 6,
                            background: "rgba(255,255,255,0.02)", border: "none",
                            color: "rgba(255,255,255,0.3)", cursor: "pointer",
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
                      background: b === current ? "rgba(255,255,255,0.04)" : hoveredRow === `branch-${b}` ? "rgba(255,255,255,0.025)" : "transparent",
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
                        color: b === current ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.4)",
                        fontSize: s(11),
                        fontFamily: "'JetBrains Mono',monospace",
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
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmDelete({ type: "branch", name: b }); setError(null); }}
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "center",
                          width: 22, height: 22, borderRadius: 5,
                          background: "transparent", border: "none",
                          color: "rgba(255,255,255,0.15)", cursor: "pointer",
                          opacity: hoveredRow === `branch-${b}` ? 1 : 0,
                          transition: "opacity .12s",
                          flexShrink: 0, marginLeft: 4,
                        }}
                      ><Trash2 size={11} strokeWidth={2} /></button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Worktree list */}
          {mode === "worktree" && (
            <div style={{ maxHeight: 240, overflowY: "auto" }}>
              {worktreeLocked && (
                <div style={{
                  padding: "6px 12px",
                  fontSize: s(9),
                  fontFamily: "'JetBrains Mono',monospace",
                  color: "rgba(255,255,255,0.25)",
                  letterSpacing: ".04em",
                }}>
                  Start a new chat to switch worktrees
                </div>
              )}
              {/* None option — use main repo directly */}
              {mainWorktree && (
                <button
                  onClick={() => {
                    if (worktreeLocked || !isInWorktree) return;
                    onCwdChange?.(mainWorktree.path);
                    setOpen(false);
                    refresh();
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                    padding: "8px 12px",
                    background: !isInWorktree ? "rgba(255,255,255,0.04)" : "transparent",
                    border: "none",
                    borderRadius: 7,
                    color: !isInWorktree ? "rgba(255,255,255,0.9)" : worktreeLocked ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.4)",
                    fontSize: s(11),
                    fontFamily: "'JetBrains Mono',monospace",
                    cursor: worktreeLocked && isInWorktree ? "default" : "pointer",
                    textAlign: "left",
                    transition: "all .12s",
                  }}
                  onMouseEnter={(e) => { if (!worktreeLocked && isInWorktree) e.currentTarget.style.background = "rgba(255,255,255,0.025)"; }}
                  onMouseLeave={(e) => { if (isInWorktree) e.currentTarget.style.background = "transparent"; }}
                >
                  <span>None</span>
                  {!isInWorktree && <Check size={12} strokeWidth={2} style={{ opacity: 0.5, flexShrink: 0 }} />}
                </button>
              )}
              {worktrees.filter((w) => !w.bare && w.path !== mainWorktree?.path).map((wt) => {
                const isActive = wt.path === cwd;
                const isConfirming = confirmDelete?.type === "worktree" && confirmDelete.path === wt.path;

                if (isConfirming) {
                  return (
                    <div key={wt.path} style={{
                      padding: "8px 12px",
                      background: "rgba(255,180,180,0.06)",
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
                          fontFamily: "'JetBrains Mono',monospace",
                          color: "rgba(255,180,180,0.7)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}>Delete {wt.branch || "worktree"}?</span>
                        <span style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                          <button
                            onClick={handleDeleteWorktree}
                            style={{
                              display: "flex", alignItems: "center", justifyContent: "center",
                              width: 24, height: 24, borderRadius: 6,
                              background: "rgba(255,180,180,0.12)", border: "none",
                              color: "rgba(255,180,180,0.7)", cursor: "pointer",
                            }}
                          ><Check size={12} strokeWidth={2} /></button>
                          <button
                            onClick={() => { setConfirmDelete(null); setDeleteBranchToo(false); setError(null); }}
                            style={{
                              display: "flex", alignItems: "center", justifyContent: "center",
                              width: 24, height: 24, borderRadius: 6,
                              background: "rgba(255,255,255,0.02)", border: "none",
                              color: "rgba(255,255,255,0.3)", cursor: "pointer",
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
                            fontFamily: "'JetBrains Mono',monospace",
                            color: "rgba(255,255,255,0.3)",
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
                            border: "1.5px solid rgba(255,255,255,0.2)",
                            background: deleteBranchToo ? "rgba(255,180,180,0.5)" : "transparent",
                            flexShrink: 0,
                          }}>
                            {deleteBranchToo && <Check size={10} strokeWidth={2.5} style={{ color: "#fff" }} />}
                          </span>
                          Also delete branch
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
                      background: isActive ? "rgba(255,255,255,0.04)" : hoveredRow === `wt-${wt.path}` ? "rgba(255,255,255,0.025)" : "transparent",
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
                        color: isActive ? "rgba(255,255,255,0.9)" : worktreeLocked ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.4)",
                        fontSize: s(11),
                        fontFamily: "'JetBrains Mono',monospace",
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
                        color: "rgba(255,255,255,0.2)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        maxWidth: "100%",
                      }}>
                        {wt.branch || "detached"}
                      </span>
                    </button>
                    {!isActive && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmDelete({ type: "worktree", path: wt.path, branch: wt.branch }); setDeleteBranchToo(false); setError(null); }}
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "center",
                          width: 22, height: 22, borderRadius: 5,
                          background: "transparent", border: "none",
                          color: "rgba(255,255,255,0.15)", cursor: "pointer",
                          opacity: hoveredRow === `wt-${wt.path}` ? 1 : 0,
                          transition: "opacity .12s",
                          flexShrink: 0, marginLeft: 4,
                        }}
                      ><Trash2 size={11} strokeWidth={2} /></button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {error && !creating && (
            <div style={{
              fontSize: s(9),
              color: "rgba(255,180,180,0.7)",
              padding: "4px 12px",
              fontFamily: "'JetBrains Mono',monospace",
            }}>
              {error}
            </div>
          )}

          {/* Divider + create */}
          <div style={{ height: 1, background: "rgba(255,255,255,0.04)", margin: "3px 6px" }} />

          {creating ? (
            <div style={{ padding: "6px 8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
                {/* Toggle: branch vs worktree */}
                <button
                  onClick={() => setMode(mode === "worktree" ? "branch" : "worktree")}
                  style={{
                    padding: "3px 7px",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 5,
                    color: "rgba(255,255,255,0.4)",
                    fontSize: s(8),
                    fontFamily: "'JetBrains Mono',monospace",
                    letterSpacing: ".06em",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  {mode === "worktree" ? "WORKTREE" : "BRANCH"}
                </button>
                <input
                  ref={inputRef}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                    if (e.key === "Escape") { setCreating(false); setNewName(""); setError(null); }
                  }}
                  placeholder={mode === "worktree" ? "worktree-name" : "branch-name"}
                  style={{
                    flex: 1,
                    padding: "5px 8px",
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 6,
                    color: "rgba(255,255,255,0.8)",
                    fontSize: s(10),
                    fontFamily: "'JetBrains Mono',monospace",
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
                    background: newName.trim() ? "rgba(180,255,200,0.12)" : "rgba(255,255,255,0.02)",
                    border: "none",
                    color: newName.trim() ? "rgba(180,255,200,0.7)" : "rgba(255,255,255,0.15)",
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
                    background: "rgba(255,255,255,0.02)",
                    border: "none",
                    color: "rgba(255,255,255,0.3)",
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
                  color: "rgba(255,180,180,0.7)",
                  padding: "2px 4px",
                  fontFamily: "'JetBrains Mono',monospace",
                }}>
                  {error}
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => { setCreating(true); setError(null); }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                padding: "8px 12px",
                background: "transparent",
                border: "none",
                borderRadius: 7,
                color: "rgba(255,255,255,0.3)",
                fontSize: s(10),
                fontFamily: "'JetBrains Mono',monospace",
                cursor: "pointer",
                transition: "all .12s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.025)"; e.currentTarget.style.color = "rgba(255,255,255,0.5)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "rgba(255,255,255,0.3)"; }}
            >
              <Plus size={12} strokeWidth={2} />
              {mode === "worktree" ? "New worktree" : "New branch"}
            </button>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
