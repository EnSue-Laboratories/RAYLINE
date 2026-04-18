import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { GitCommitHorizontal, X, Plus, Minus } from "lucide-react";
import { useFontScale } from "../contexts/FontSizeContext";
import useGitStatus from "../hooks/useGitStatus";

const MENU_GAP = 6;
const VIEWPORT_PADDING = 8;
const MENU_WIDTH = 360;

function letterFor(code) {
  if (code === "?") return "U";
  if (code === "A") return "A";
  if (code === "D") return "D";
  if (code === "R") return "R";
  return "M";
}

const STATUS_COLORS = {
  U: "rgba(130,210,140,0.85)",
  A: "rgba(130,210,140,0.85)",
  M: "rgba(240,180,90,0.85)",
  D: "rgba(230,120,120,0.9)",
  R: "rgba(150,190,255,0.85)",
};

const rowIconBtnStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 18,
  height: 18,
  padding: 0,
  background: "transparent",
  border: "none",
  borderRadius: 4,
  color: "rgba(255,255,255,0.5)",
  cursor: "pointer",
  transition: "color .15s",
};

export default function GitStatusPill({ cwd }) {
  const s = useFontScale();
  const { status, refresh, refetch } = useGitStatus(cwd);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const [menuStyle, setMenuStyle] = useState(null);

  const close = useCallback(() => {
    setOpen(false);
    setMenuStyle(null);
    setError(null);
  }, []);

  useEffect(() => {
    setMessage("");
    setError(null);
  }, [cwd]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    refresh();
    refetch();
  }, [open, refresh, refetch]);

  useEffect(() => {
    if (!open) return;
    const h = (e) => {
      if (triggerRef.current?.contains(e.target)) return;
      if (menuRef.current?.contains(e.target)) return;
      close();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  const updateMenuPosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const alignRight = rect.left + MENU_WIDTH > window.innerWidth - VIEWPORT_PADDING;
    const left = alignRight
      ? Math.max(VIEWPORT_PADDING, rect.right - MENU_WIDTH)
      : Math.min(rect.left, window.innerWidth - MENU_WIDTH - VIEWPORT_PADDING);
    setMenuStyle({ top: rect.bottom + MENU_GAP, left, width: MENU_WIDTH });
  }, []);

  useEffect(() => {
    if (!open) return;
    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, updateMenuPosition]);

  if (!status) return null;

  const dirty = status.files.length;
  const { ahead, behind, detached, upstream, branch } = status;
  const clean = dirty === 0 && ahead === 0 && behind === 0;
  const staged = status.files.filter((f) => f.index !== "." && f.index !== "?");
  const unstaged = status.files.filter((f) => f.worktree !== "." || f.index === "?");
  const canPush = !detached && upstream;
  const canPull = !detached && upstream && behind > 0;
  const canCommit = !detached && dirty > 0 && message.trim().length > 0 && !busy;

  const handleCommitAndPush = async () => {
    if (!canCommit) return;
    setBusy(true);
    setError(null);
    try {
      const c = await window.api.gitCommit(cwd, message.trim());
      if (!c.ok) { setError(c.stderr || "Commit failed"); return; }
      setMessage("");
      if (canPush) {
        const p = await window.api.gitPush(cwd);
        if (!p.ok) { setError(p.stderr || "Push failed"); await refresh(); return; }
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleStage = async (path) => {
    if (!window.api?.gitStage) return;
    await window.api.gitStage(cwd, [path]);
    await refresh();
  };

  const handleUnstage = async (path) => {
    if (!window.api?.gitUnstage) return;
    await window.api.gitUnstage(cwd, [path]);
    await refresh();
  };

  const handlePull = async () => {
    if (!canPull) return;
    setBusy(true);
    setError(null);
    try {
      const p = await window.api.gitPull(cwd);
      if (!p.ok) setError(p.stderr || "Pull failed");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const popover = open && menuStyle ? createPortal(
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        top: menuStyle.top,
        left: menuStyle.left,
        width: menuStyle.width,
        background: "rgba(10,10,12,0.55)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 10,
        boxShadow: "0 12px 36px rgba(0,0,0,0.5)",
        backdropFilter: "blur(56px) saturate(1.1)",
        WebkitBackdropFilter: "blur(56px) saturate(1.1)",
        color: "rgba(255,255,255,0.85)",
        fontFamily: "system-ui, sans-serif",
        fontSize: s(12),
        zIndex: 9999,
        overflow: "hidden",
      }}
    >
      {/* header */}
      <div style={{
        padding: "10px 12px",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        fontFamily: "'JetBrains Mono',monospace",
        fontSize: s(11),
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}>
        <span style={{ color: "rgba(255,255,255,0.7)" }}>
          {branch || (detached ? "(detached)" : "?")}
          {upstream && <span style={{ color: "rgba(255,255,255,0.3)" }}> → {upstream}</span>}
        </span>
        <span style={{ display: "flex", gap: 10 }}>
          <span style={{ color: ahead > 0 ? "rgba(130,210,140,0.9)" : "rgba(255,255,255,0.3)" }}>
            ↑{ahead}
          </span>
          <span style={{ color: behind > 0 ? "rgba(150,190,255,0.9)" : "rgba(255,255,255,0.3)" }}>
            ↓{behind}
          </span>
        </span>
      </div>

      {/* file list */}
      <div style={{ padding: "8px 12px", maxHeight: 260, overflowY: "auto" }}>
        {clean && (
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: s(10), fontFamily: "'JetBrains Mono',monospace", letterSpacing: ".08em" }}>
            NO CHANGES
          </div>
        )}
        {staged.length > 0 && (
          <FileSection
            title={`STAGED CHANGES (${staged.length})`}
            files={staged}
            s={s}
            pickCode={(f) => f.index}
            action="unstage"
            onAction={handleUnstage}
          />
        )}
        {unstaged.length > 0 && (
          <FileSection
            title={`CHANGES (${unstaged.length})`}
            files={unstaged}
            s={s}
            pickCode={(f) => (f.index === "?" ? "?" : f.worktree)}
            action="stage"
            onAction={handleStage}
            style={{ marginTop: staged.length > 0 ? 10 : 0 }}
          />
        )}
      </div>

      {/* commit message */}
      {!detached && (
        <div style={{ padding: "8px 12px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          <textarea
            placeholder="Commit message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={1}
            style={{
              width: "100%",
              boxSizing: "border-box",
              resize: "none",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 6,
              color: "rgba(255,255,255,0.9)",
              fontFamily: "system-ui,sans-serif",
              fontSize: s(12),
              lineHeight: 1.4,
              padding: "6px 8px",
              outline: "none",
            }}
          />
        </div>
      )}

      {/* action buttons */}
      <div style={{ padding: "8px 12px", display: "flex", gap: 8, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <button
          onClick={handleCommitAndPush}
          disabled={!canCommit}
          style={{
            flex: 1,
            height: 30,
            background: canCommit ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)",
            border: "1px solid " + (canCommit ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.05)"),
            borderRadius: 6,
            color: canCommit ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.3)",
            fontSize: s(12),
            fontFamily: "system-ui,sans-serif",
            cursor: canCommit ? "pointer" : "default",
            transition: "all .15s",
          }}
        >
          {busy ? "…" : "Commit & Push"}
        </button>
        <button
          onClick={handlePull}
          disabled={!canPull || busy}
          style={{
            height: 30,
            padding: "0 14px",
            background: canPull ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.03)",
            border: "1px solid " + (canPull ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.05)"),
            borderRadius: 6,
            color: canPull ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.3)",
            fontSize: s(12),
            fontFamily: "system-ui,sans-serif",
            cursor: canPull && !busy ? "pointer" : "default",
          }}
        >
          Pull
        </button>
      </div>

      {error && (
        <div style={{
          padding: "8px 12px",
          background: "rgba(200,80,80,0.08)",
          borderTop: "1px solid rgba(200,80,80,0.2)",
          color: "rgba(255,180,180,0.9)",
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: s(11),
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
        }}>
          <span style={{ flex: 1, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{error}</span>
          <button onClick={() => setError(null)} style={{ background: "none", border: "none", color: "rgba(255,180,180,0.9)", cursor: "pointer", padding: 0 }}>
            <X size={12} />
          </button>
        </div>
      )}
    </div>,
    document.body,
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        title={
          detached ? "Detached HEAD" :
          !upstream ? "No upstream configured" :
          clean ? "Clean & in sync" :
          `${dirty} changed · ${ahead} ahead · ${behind} behind`
        }
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 10px",
          borderRadius: 7,
          background: open ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.02)",
          border: "1px solid " + (open ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.04)"),
          color: "rgba(255,255,255,0.4)",
          fontSize: s(10),
          fontFamily: "'JetBrains Mono',monospace",
          letterSpacing: ".04em",
          cursor: "pointer",
          transition: "all .2s",
        }}
        onMouseEnter={(e) => { if (!open) e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; }}
        onMouseLeave={(e) => { if (!open) e.currentTarget.style.borderColor = "rgba(255,255,255,0.04)"; }}
      >
        {detached ? (
          <>
            <GitCommitHorizontal size={13} strokeWidth={1.6} />
            <span style={{ color: "rgba(200,160,100,0.8)" }}>detached</span>
          </>
        ) : !upstream ? (
          <>
            <GitCommitHorizontal size={13} strokeWidth={1.6} />
            <span style={{ color: "rgba(255,255,255,0.4)" }}>local</span>
          </>
        ) : clean ? (
          <GitCommitHorizontal size={13} strokeWidth={1.6} />
        ) : (
          <>
            {(dirty > 0 || ahead > 0) && <span>↑{dirty > 0 ? dirty : ahead}</span>}
            {behind > 0 && <span>↓{behind}</span>}
          </>
        )}
      </button>
      {popover}
    </>
  );
}

function FileSection({ title, files, s, pickCode, action, onAction, style }) {
  return (
    <div style={style}>
      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: s(10), fontFamily: "'JetBrains Mono',monospace", letterSpacing: ".08em", marginBottom: 6 }}>
        {title}
      </div>
      {files.map((f) => (
        <FileRow
          key={f.path + ":" + action}
          file={f}
          s={s}
          letter={letterFor(pickCode(f))}
          action={action}
          onAction={onAction}
        />
      ))}
    </div>
  );
}

function FileRow({ file, s, letter, action, onAction }) {
  const [hover, setHover] = useState(false);
  const Icon = action === "stage" ? Plus : Minus;
  const actionTitle = action === "stage" ? "Stage" : "Unstage";
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", gap: 8, alignItems: "center",
        fontFamily: "'JetBrains Mono',monospace", fontSize: s(11),
        padding: "2px 0", color: "rgba(255,255,255,0.7)",
      }}
    >
      <span style={{ width: 14, color: STATUS_COLORS[letter] || "rgba(255,255,255,0.6)" }}>{letter}</span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{file.path}</span>
      <button
        onClick={() => onAction(file.path)}
        title={actionTitle}
        style={{ ...rowIconBtnStyle, visibility: hover ? "visible" : "hidden" }}
        onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.9)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.5)"; }}
      >
        <Icon size={12} strokeWidth={1.8} />
      </button>
    </div>
  );
}
