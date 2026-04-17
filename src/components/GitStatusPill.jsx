import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { GitCommitHorizontal, Sparkles, X } from "lucide-react";
import { useFontScale } from "../contexts/FontSizeContext";
import useGitStatus from "../hooks/useGitStatus";

const MENU_GAP = 6;
const VIEWPORT_PADDING = 8;
const MENU_WIDTH = 360;

function statusLetter(idx, wt) {
  if (idx === "?" ) return "?" ;
  if (idx === "A" || wt === "A") return "A";
  if (idx === "D" || wt === "D") return "D";
  if (idx === "R" || wt === "R") return "R";
  return "M";
}

export default function GitStatusPill({ cwd }) {
  const s = useFontScale();
  const { status, refresh, refetch } = useGitStatus(cwd);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [generating, setGenerating] = useState(false);
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
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const alignRight = rect.left + MENU_WIDTH > window.innerWidth - VIEWPORT_PADDING;
    const left = alignRight
      ? Math.max(VIEWPORT_PADDING, rect.right - MENU_WIDTH)
      : Math.min(rect.left, window.innerWidth - MENU_WIDTH - VIEWPORT_PADDING);
    setMenuStyle({ top: rect.bottom + MENU_GAP, left, width: MENU_WIDTH });
  }, [open]);

  if (!status) return null;

  const dirty = status.files.length;
  const { ahead, behind, detached, upstream, branch } = status;
  const clean = dirty === 0 && ahead === 0 && behind === 0;
  const canPush = !detached && upstream;
  const canPull = !detached && upstream && behind > 0;
  const canCommit = !detached && dirty > 0 && message.trim().length > 0 && !busy;

  const handleGenerate = async () => {
    if (generating || !window.api?.gitGenerateCommitMessage) return;
    setGenerating(true);
    try {
      const { message: msg } = await window.api.gitGenerateCommitMessage(cwd);
      if (msg) setMessage(msg);
      else setError("Couldn't generate a message.");
    } finally {
      setGenerating(false);
    }
  };

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
        if (!p.ok) { setError(p.stderr || "Push failed"); return; }
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const handlePull = async () => {
    if (!canPull) return;
    setBusy(true);
    setError(null);
    try {
      const p = await window.api.gitPull(cwd);
      if (!p.ok) setError(p.stderr || "Pull failed");
      else await refresh();
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
        background: "rgba(14,14,14,0.98)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 10,
        boxShadow: "0 12px 36px rgba(0,0,0,0.6)",
        backdropFilter: "blur(24px) saturate(1.1)",
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
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        fontFamily: "'JetBrains Mono',monospace",
        fontSize: s(11),
      }}>
        <span style={{ color: "rgba(255,255,255,0.7)" }}>
          {branch || (detached ? "(detached)" : "?")}
          {upstream && <span style={{ color: "rgba(255,255,255,0.3)" }}> → {upstream}</span>}
        </span>
        <span style={{ color: "rgba(255,255,255,0.4)" }}>
          ↑{ahead} ↓{behind}
        </span>
      </div>

      {/* file list */}
      <div style={{ padding: "8px 12px", maxHeight: 200, overflowY: "auto" }}>
        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: s(10), fontFamily: "'JetBrains Mono',monospace", letterSpacing: ".08em", marginBottom: 6 }}>
          {clean ? "NO CHANGES" : `CHANGED FILES (${dirty})`}
        </div>
        {status.files.map((f) => (
          <div key={f.path} style={{
            display: "flex", gap: 8, alignItems: "center",
            fontFamily: "'JetBrains Mono',monospace", fontSize: s(11),
            padding: "2px 0", color: "rgba(255,255,255,0.7)",
          }}>
            <span style={{ width: 14, color: "rgba(240,180,90,0.8)" }}>{statusLetter(f.index, f.worktree)}</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{f.path}</span>
          </div>
        ))}
      </div>

      {/* commit message */}
      {!detached && (
        <div style={{ padding: "8px 12px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
            <textarea
              placeholder="Commit message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={2}
              style={{
                flex: 1,
                resize: "none",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 6,
                color: "rgba(255,255,255,0.9)",
                fontFamily: "system-ui,sans-serif",
                fontSize: s(12),
                padding: "6px 8px",
                outline: "none",
              }}
            />
            <button
              onClick={handleGenerate}
              disabled={generating || dirty === 0}
              title="Generate commit message with Claude"
              style={{
                display: "flex", alignItems: "center", gap: 4,
                height: 28, padding: "0 8px",
                borderRadius: 6,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: generating ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.7)",
                fontSize: s(11),
                fontFamily: "'JetBrains Mono',monospace",
                cursor: generating || dirty === 0 ? "default" : "pointer",
                opacity: dirty === 0 ? 0.4 : 1,
              }}
            >
              <Sparkles size={12} strokeWidth={1.6} />
              {generating ? "…" : "GEN"}
            </button>
          </div>
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
          height: 23,
          padding: "0 8px",
          borderRadius: 7,
          background: open ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.04)",
          border: "1px solid " + (open ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)"),
          color: "rgba(255,255,255,0.6)",
          fontSize: s(11),
          fontFamily: "'JetBrains Mono',monospace",
          letterSpacing: ".04em",
          cursor: "pointer",
          transition: "all .15s",
        }}
      >
        <GitCommitHorizontal size={13} strokeWidth={1.6} />
        {detached ? (
          <span style={{ color: "rgba(200,160,100,0.8)" }}>detached</span>
        ) : !upstream ? (
          <span style={{ color: "rgba(255,255,255,0.4)" }}>local</span>
        ) : clean ? (
          <span style={{ color: "rgba(255,255,255,0.35)" }}>GIT</span>
        ) : (
          <>
            {dirty > 0 && <span style={{ color: "rgba(240,180,90,0.9)" }}>●{dirty}</span>}
            {ahead > 0 && <span style={{ color: "rgba(255,255,255,0.85)" }}>↑{ahead}</span>}
            {behind > 0 && <span style={{ color: "rgba(150,190,255,0.9)" }}>↓{behind}</span>}
          </>
        )}
      </button>
      {popover}
    </>
  );
}
