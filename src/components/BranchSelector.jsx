import { useState, useRef, useEffect, useCallback } from "react";
import { GitBranch, Plus, GitFork, Check, X } from "lucide-react";
import { useFontScale } from "../contexts/FontSizeContext";

export default function BranchSelector({ cwd, onCwdChange }) {
  const s = useFontScale();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(null);
  const [branches, setBranches] = useState([]);
  const [worktrees, setWorktrees] = useState([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [mode, setMode] = useState("branch"); // "branch" | "worktree"
  const [error, setError] = useState(null);
  const ref = useRef(null);
  const inputRef = useRef(null);

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
    } catch {}
  }, [cwd]);

  useEffect(() => { refresh(); }, [refresh]);

  // Close on outside click
  useEffect(() => {
    const h = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        setCreating(false);
        setError(null);
      }
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
      setOpen(false);
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
        // Create worktree as sibling directory
        const basePath = cwd.replace(/\/$/, "");
        const wtPath = `${basePath}-${name}`;
        await window.api.gitWorktreeAdd(cwd, wtPath, name);
        if (onCwdChange) onCwdChange(wtPath);
      } else {
        await window.api.gitCreateBranch(cwd, name);
        setCurrent(name);
      }
      setNewName("");
      setCreating(false);
      setOpen(false);
      refresh();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleWorktreeSwitch = (wt) => {
    if (wt.path === cwd) return;
    if (onCwdChange) onCwdChange(wt.path);
    setOpen(false);
  };

  if (!cwd || !current) return null;

  const hasWorktrees = worktrees.length > 1;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => { setOpen(!open); setCreating(false); setError(null); refresh(); }}
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
          maxWidth: 160,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.04)"; }}
      >
        <GitBranch size={11} strokeWidth={2} />
        <span style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {current}
        </span>
        {hasWorktrees && (
          <GitFork size={9} strokeWidth={2} style={{ opacity: 0.5, flexShrink: 0 }} />
        )}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            zIndex: 200,
            minWidth: 240,
            maxWidth: 320,
            background: "rgba(8,8,12,0.92)",
            backdropFilter: "blur(32px)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 10,
            padding: 3,
            boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
            animation: "dropIn .15s ease",
          }}
        >
          {/* Tab: Branches / Worktrees */}
          {hasWorktrees && (
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
          )}

          {/* Branch list */}
          {mode === "branch" && (
            <div style={{ maxHeight: 240, overflowY: "auto" }}>
              {branches.map((b) => (
                <button
                  key={b}
                  onClick={() => handleCheckout(b)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                    padding: "8px 12px",
                    background: b === current ? "rgba(255,255,255,0.04)" : "transparent",
                    border: "none",
                    borderRadius: 7,
                    color: b === current ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.4)",
                    fontSize: s(11),
                    fontFamily: "'JetBrains Mono',monospace",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all .12s",
                  }}
                  onMouseEnter={(e) => { if (b !== current) e.currentTarget.style.background = "rgba(255,255,255,0.025)"; }}
                  onMouseLeave={(e) => { if (b !== current) e.currentTarget.style.background = "transparent"; }}
                >
                  <span style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}>{b}</span>
                  {b === current && <Check size={12} strokeWidth={2} style={{ opacity: 0.5, flexShrink: 0 }} />}
                </button>
              ))}
            </div>
          )}

          {/* Worktree list */}
          {mode === "worktree" && (
            <div style={{ maxHeight: 240, overflowY: "auto" }}>
              {worktrees.filter((w) => !w.bare).map((wt) => (
                <button
                  key={wt.path}
                  onClick={() => handleWorktreeSwitch(wt)}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    width: "100%",
                    padding: "8px 12px",
                    background: wt.path === cwd ? "rgba(255,255,255,0.04)" : "transparent",
                    border: "none",
                    borderRadius: 7,
                    color: wt.path === cwd ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.4)",
                    fontSize: s(11),
                    fontFamily: "'JetBrains Mono',monospace",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all .12s",
                    gap: 2,
                  }}
                  onMouseEnter={(e) => { if (wt.path !== cwd) e.currentTarget.style.background = "rgba(255,255,255,0.025)"; }}
                  onMouseLeave={(e) => { if (wt.path !== cwd) e.currentTarget.style.background = "transparent"; }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <GitBranch size={10} strokeWidth={2} />
                    {wt.branch || "detached"}
                    {wt.path === cwd && <Check size={12} strokeWidth={2} style={{ opacity: 0.5 }} />}
                  </span>
                  <span style={{
                    fontSize: s(8),
                    color: "rgba(255,255,255,0.2)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: "100%",
                  }}>
                    {wt.path}
                  </span>
                </button>
              ))}
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
              New branch
            </button>
          )}
        </div>
      )}
    </div>
  );
}
