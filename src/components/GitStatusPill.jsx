import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { GitCommitHorizontal, GitPullRequestArrow, CloudUpload, Check, X, Plus, Minus, Undo2, RefreshCwOff, Loader2 } from "lucide-react";
import { useFontScale } from "../contexts/FontSizeContext";
import useGitStatus from "../hooks/useGitStatus";
import { createTranslator } from "../i18n";

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

export default function GitStatusPill({ cwd, defaultPrBranch, coauthorEnabled = false, coauthorTrailer = "", locale }) {
  const s = useFontScale();
  const t = useMemo(() => createTranslator(locale), [locale]);
  const { status, refresh, refetch } = useGitStatus(cwd);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [isCreatingPr, setIsCreatingPr] = useState(false);
  const [error, setError] = useState(null);
  const [prSuccess, setPrSuccess] = useState("");
  const [prInfo, setPrInfo] = useState({ loading: false, checked: false, unavailable: false, openPr: null });
  const [confirm, setConfirm] = useState(null); // { title, body, confirmLabel, destructive, onConfirm }
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const [menuStyle, setMenuStyle] = useState(null);
  const cwdRef = useRef(cwd);
  const prSuccessTimerRef = useRef(null);

  useEffect(() => { cwdRef.current = cwd; }, [cwd]);

  const clearPrSuccess = useCallback(() => {
    if (prSuccessTimerRef.current) {
      clearTimeout(prSuccessTimerRef.current);
      prSuccessTimerRef.current = null;
    }
    setPrSuccess("");
  }, []);

  const flashPrSuccess = useCallback((label) => {
    if (prSuccessTimerRef.current) clearTimeout(prSuccessTimerRef.current);
    setPrSuccess(label);
    prSuccessTimerRef.current = setTimeout(() => {
      prSuccessTimerRef.current = null;
      setPrSuccess("");
    }, 1800);
  }, []);

  useEffect(() => () => {
    if (prSuccessTimerRef.current) clearTimeout(prSuccessTimerRef.current);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setMenuStyle(null);
    setError(null);
    clearPrSuccess();
  }, [clearPrSuccess]);

  const refreshPrInfo = useCallback(async () => {
    if (!cwd || !window.api?.gitPrStatus) {
      setPrInfo({ loading: false, checked: false, unavailable: true, openPr: null });
      return;
    }
    const requestCwd = cwd;
    setPrInfo((prev) => ({ ...prev, loading: true }));
    try {
      const r = await window.api.gitPrStatus(requestCwd);
      if (cwdRef.current !== requestCwd) return;
      if (!r?.ok) {
        setPrInfo({ loading: false, checked: false, unavailable: true, openPr: null });
        return;
      }
      setPrInfo({
        loading: false,
        checked: true,
        unavailable: false,
        openPr: r.openPr || null,
      });
    } catch {
      if (cwdRef.current !== requestCwd) return;
      setPrInfo({ loading: false, checked: false, unavailable: true, openPr: null });
    }
  }, [cwd]);

  useEffect(() => {
    setMessage("");
    setError(null);
    clearPrSuccess();
    setGenerating(false);
    setIsCreatingPr(false);
    setPrInfo({ loading: false, checked: false, unavailable: false, openPr: null });
  }, [cwd, clearPrSuccess]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    refresh();
    refetch();
    refreshPrInfo();
  }, [open, refresh, refetch, refreshPrInfo]);

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
  const prBase = (defaultPrBranch || "main").trim();
  const openPr = prInfo.openPr?.headRefName === branch ? prInfo.openPr : null;
  const hasOpenPr = !!openPr;
  const isCheckingPr = !prInfo.unavailable && prInfo.loading && !prInfo.checked;
  const canPr = !detached && !!branch && branch !== prBase && !busy && !!upstream && !isCheckingPr && !hasOpenPr;
  const canPublish = !detached && !!branch && !upstream && !busy;
  const prTitle = prSuccess || (isCreatingPr
    ? t("git.status.creatingPr")
    : isCheckingPr
    ? t("git.status.checkingPrTitle")
    : canPr
      ? t("git.status.createPrTitle", { base: prBase })
      : branch === prBase
        ? t("git.status.onBaseBranch", { base: prBase })
        : hasOpenPr
          ? t("git.status.upstreamPrExists", { number: openPr.number })
          : t("git.status.cannotCreatePr"));

  const handleCommitAndPush = async () => {
    if (!canCommit) return;
    setBusy(true);
    setError(null);
    clearPrSuccess();
    try {
      const trailer = coauthorEnabled ? (coauthorTrailer || "").trim() : "";
      const c = await window.api.gitCommit(cwd, message.trim(), trailer);
      if (!c.ok) { setError(c.stderr || t("git.status.commitFailed")); return; }
      setMessage("");
      if (canPush) {
        const p = await window.api.gitPush(cwd);
        if (!p.ok) { setError(p.stderr || t("git.status.pushFailed")); await refresh(); return; }
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

  const handleStageAll = async () => {
    if (!window.api?.gitStage) return;
    const paths = unstaged.map((f) => f.path);
    if (!paths.length) return;
    await window.api.gitStage(cwd, paths);
    await refresh();
  };

  const handleUnstageAll = async () => {
    if (!window.api?.gitUnstage) return;
    const paths = staged.map((f) => f.path);
    if (!paths.length) return;
    await window.api.gitUnstage(cwd, paths);
    await refresh();
  };

  const handleRevert = (path, untracked) => {
    if (!window.api?.gitRevert) return;
    setConfirm({
      title: untracked ? t("git.status.deleteUntrackedTitle") : t("git.status.discardChangesTitle"),
      body: untracked
        ? t("git.status.deleteUntrackedBody", { path })
        : t("git.status.discardChangesBody", { path }),
      confirmLabel: untracked ? t("git.status.delete") : t("git.status.discard"),
      destructive: true,
      onConfirm: async () => {
        const r = await window.api.gitRevert(cwd, path, !!untracked);
        if (!r.ok) setError(r.stderr || t("git.status.revertFailed"));
        await refresh();
      },
    });
  };

  const handleIgnore = async (path) => {
    if (!window.api?.gitIgnore) return;
    const r = await window.api.gitIgnore(cwd, path);
    if (!r.ok) setError(r.stderr || t("git.status.gitignoreFailed"));
    await refresh();
  };

  const handleCreatePr = async () => {
    if (!canPr || isCreatingPr || !window.api?.gitCreatePr) return;
    setIsCreatingPr(true);
    setBusy(true);
    setError(null);
    clearPrSuccess();
    try {
      const r = await window.api.gitCreatePr(cwd, prBase);
      if (!r.ok) { setError(r.stderr || t("git.status.createPrFailed")); return; }
      await refresh();
      await refreshPrInfo();
      flashPrSuccess(t("git.status.prCreated"));
    } catch (err) {
      setError(err?.message || t("git.status.createPrFailed"));
    } finally {
      setIsCreatingPr(false);
      setBusy(false);
    }
  };

  const handleMergePr = async () => {
    if (!openPr || !window.api?.gitMergePr) return;
    setBusy(true);
    setError(null);
    clearPrSuccess();
    try {
      const r = await window.api.gitMergePr(cwd);
      if (!r.ok) { setError(r.stderr || t("git.status.mergePrFailed")); return; }
      await refreshPrInfo();
      await refetch();
      await refresh();
      flashPrSuccess(t("git.status.prMerged"));
    } finally {
      setBusy(false);
    }
  };

  const handleGenerateMessage = async () => {
    if (generating || !window.api?.gitGenCommitMessage) return;
    const requestCwd = cwd;
    setGenerating(true);
    setError(null);
    try {
      const r = await window.api.gitGenCommitMessage(requestCwd);
      if (cwdRef.current !== requestCwd) return;
      if (!r.ok) {
        setError(r.stderr || t("git.status.genCommitMessageFailed"));
        return;
      }
      setMessage(r.message || "");
    } finally {
      if (cwdRef.current === requestCwd) setGenerating(false);
    }
  };

  const handlePublish = async () => {
    if (!canPublish) return;
    setBusy(true);
    setError(null);
    clearPrSuccess();
    try {
      const p = await window.api.gitPush(cwd);
      if (!p.ok) { setError(p.stderr || t("git.status.publishFailed")); return; }
      await refresh();
      await refreshPrInfo();
    } finally {
      setBusy(false);
    }
  };

  const handlePull = async () => {
    if (!canPull) return;
    setBusy(true);
    setError(null);
    clearPrSuccess();
    try {
      const p = await window.api.gitPull(cwd);
      if (!p.ok) setError(p.stderr || t("git.status.pullFailed"));
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
          {branch || (detached ? t("git.status.detachedLabel") : "?")}
          {upstream && <span style={{ color: "rgba(255,255,255,0.3)" }}> → {upstream}</span>}
        </span>
        <span style={{ display: "flex", gap: 10 }}>
          <span style={{ color: ahead > 0 ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.3)" }}>
            ↑{ahead}
          </span>
          <span style={{ color: behind > 0 ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.3)" }}>
            ↓{behind}
          </span>
        </span>
      </div>

      {/* file list */}
      <div style={{ padding: "8px 12px", maxHeight: 260, overflowY: "auto" }}>
        {clean && (
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: s(10), fontFamily: "'JetBrains Mono',monospace", letterSpacing: ".08em" }}>
            {t("git.status.noChanges")}
          </div>
        )}
        {staged.length > 0 && (
          <FileSection
            title={t("git.status.stagedChanges", { count: staged.length })}
            files={staged}
            s={s}
            pickCode={(f) => f.index}
            action="unstage"
            onAction={handleUnstage}
            onRevert={handleRevert}
            onBulkAction={handleUnstageAll}
            bulkActionTitle={t("git.status.unstageAll")}
            t={t}
          />
        )}
        {unstaged.length > 0 && (
          <FileSection
            title={t("git.status.changes", { count: unstaged.length })}
            files={unstaged}
            s={s}
            pickCode={(f) => (f.index === "?" ? "?" : f.worktree)}
            action="stage"
            onAction={handleStage}
            onRevert={handleRevert}
            onIgnore={handleIgnore}
            onBulkAction={handleStageAll}
            bulkActionTitle={t("git.status.stageAll")}
            style={{ marginTop: staged.length > 0 ? 10 : 0 }}
            t={t}
          />
        )}
      </div>

      {/* commit message */}
      {!detached && (
        <div style={{ padding: "8px 12px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          <textarea
            placeholder={generating ? t("git.status.generating") : t("git.status.commitPlaceholder")}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Tab" && !e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey) {
                if (message.trim().length > 0) return; // don't clobber user text
                e.preventDefault();
                handleGenerateMessage();
              }
            }}
            disabled={generating}
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
              opacity: generating ? 0.6 : 1,
            }}
          />
        </div>
      )}

      {(isCheckingPr || openPr) && (
        <div style={{
          padding: "0 12px 8px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          color: openPr ? "rgba(255,255,255,0.72)" : "rgba(255,255,255,0.42)",
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: s(11),
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            <GitPullRequestArrow size={12} strokeWidth={1.6} />
            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {isCheckingPr
                ? t("git.status.checkingPrStatus")
                : t("git.status.upstreamPr", { number: openPr.number, base: openPr.baseRefName })}
            </span>
          </div>
          {openPr && (
            <button
              onClick={handleMergePr}
              disabled={busy}
              onMouseEnter={(e) => {
                if (busy) return;
                e.currentTarget.style.color = "rgba(255,255,255,0.96)";
                e.currentTarget.style.textDecorationColor = "rgba(255,255,255,0.96)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "rgba(255,255,255,0.78)";
                e.currentTarget.style.textDecorationColor = "rgba(255,255,255,0.52)";
              }}
              style={{
                padding: 0,
                background: "none",
                border: "none",
                color: "rgba(255,255,255,0.78)",
                fontSize: s(10),
                fontFamily: "system-ui,sans-serif",
                cursor: busy ? "default" : "pointer",
                flexShrink: 0,
                textDecorationLine: "underline",
                textDecorationStyle: "dashed",
                textDecorationColor: "rgba(255,255,255,0.52)",
                textUnderlineOffset: "0.22em",
                textDecorationThickness: "1px",
                transition: "color .15s ease, text-decoration-color .15s ease",
              }}
            >
              {busy ? "…" : t("git.status.merge")}
            </button>
          )}
        </div>
      )}

      {/* action buttons */}
      <div style={{ padding: "0 12px 8px", display: "flex", gap: 8 }}>
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
          {busy ? "…" : t("git.status.commitAndPush")}
        </button>
        {!upstream && !detached ? (
          <button
            onClick={handlePublish}
            disabled={!canPublish}
            title={canPublish ? t("git.status.publishTooltip", { branch }) : t("git.status.cannotPublish")}
            style={{
              height: 30,
              padding: "0 10px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              background: canPublish ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.03)",
              border: "1px solid " + (canPublish ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.05)"),
              borderRadius: 6,
              color: canPublish ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.3)",
              fontFamily: "system-ui,sans-serif",
              cursor: canPublish ? "pointer" : "default",
            }}
          >
            <CloudUpload size={14} strokeWidth={1.6} />
          </button>
        ) : (
          <button
            onClick={handleCreatePr}
            disabled={!canPr || isCreatingPr}
            title={prTitle}
            aria-busy={isCreatingPr}
            style={{
              height: 30,
              padding: isCreatingPr ? "0 12px" : "0 10px",
              minWidth: isCreatingPr ? 124 : undefined,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              background: prSuccess
                ? "rgba(90,180,120,0.16)"
                : isCreatingPr
                ? "rgba(255,255,255,0.1)"
                : canPr
                ? (hasOpenPr ? "rgba(120,170,255,0.12)" : "rgba(255,255,255,0.06)")
                : "rgba(255,255,255,0.03)",
              border: "1px solid " + (prSuccess
                ? "rgba(90,180,120,0.28)"
                : isCreatingPr
                ? "rgba(255,255,255,0.18)"
                : canPr
                ? (hasOpenPr ? "rgba(120,170,255,0.2)" : "rgba(255,255,255,0.1)")
                : "rgba(255,255,255,0.05)"),
              borderRadius: 6,
              color: prSuccess
                ? "rgba(190,255,205,0.96)"
                : isCreatingPr
                ? "rgba(255,255,255,0.88)"
                : canPr
                ? (hasOpenPr ? "rgba(190,220,255,0.92)" : "rgba(255,255,255,0.8)")
                : "rgba(255,255,255,0.3)",
              fontFamily: "system-ui,sans-serif",
              fontSize: s(11),
              cursor: canPr && !prSuccess && !isCreatingPr ? "pointer" : "default",
            }}
          >
            {prSuccess
              ? <Check size={14} strokeWidth={2} />
              : isCreatingPr
                ? (
                  <>
                    <Loader2 size={13} strokeWidth={1.8} style={{ animation: "spin 1s linear infinite" }} />
                    <span>{t("git.status.creatingPr")}</span>
                  </>
                )
                : <GitPullRequestArrow size={14} strokeWidth={1.6} />}
          </button>
        )}
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
          {t("git.status.pull")}
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
          detached ? t("git.status.detachedTooltip") :
          !upstream ? t("git.status.noUpstream") :
          clean ? t("git.status.cleanInSync") :
          t("git.status.statusSummary", { dirty, ahead, behind })
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
            <span style={{ color: "rgba(200,160,100,0.8)" }}>{t("git.status.detached")}</span>
          </>
        ) : !upstream ? (
          <>
            <GitCommitHorizontal size={13} strokeWidth={1.6} />
            <span style={{ color: "rgba(255,255,255,0.4)" }}>{t("git.status.local")}</span>
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
      {confirm && (
        <ConfirmDialog
          s={s}
          title={confirm.title}
          body={confirm.body}
          confirmLabel={confirm.confirmLabel}
          destructive={confirm.destructive}
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            const fn = confirm.onConfirm;
            setConfirm(null);
            if (fn) await fn();
          }}
          t={t}
        />
      )}
    </>
  );
}

function ConfirmDialog({ s, title, body, confirmLabel, destructive, onCancel, onConfirm, t }) {
  const confirmBtnRef = useRef(null);
  useEffect(() => {
    confirmBtnRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); onCancel(); }
      else if (e.key === "Enter") { e.stopPropagation(); onConfirm(); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onCancel, onConfirm]);

  const accent = destructive ? "rgba(230,120,120,0.95)" : "rgba(150,190,255,0.95)";
  const accentBg = destructive ? "rgba(230,120,120,0.14)" : "rgba(150,190,255,0.14)";
  const accentBorder = destructive ? "rgba(230,120,120,0.35)" : "rgba(150,190,255,0.35)";

  return createPortal(
    <div
      onMouseDown={onCancel}
      style={{
        position: "fixed", inset: 0, zIndex: 10000,
        background: "rgba(0,0,0,0.25)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{
          width: "min(420px, 100%)",
          background: "rgba(14,14,16,0.55)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 14,
          boxShadow: "0 24px 60px rgba(0,0,0,0.55)",
          backdropFilter: "blur(72px) saturate(1.15)",
          WebkitBackdropFilter: "blur(72px) saturate(1.15)",
          color: "rgba(255,255,255,0.9)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "16px 18px 4px", fontSize: s(14), fontWeight: 600, letterSpacing: "-0.005em" }}>
          {title}
        </div>
        <div style={{ padding: "4px 18px 16px", fontSize: s(12), lineHeight: 1.5, color: "rgba(255,255,255,0.65)" }}>
          {body}
        </div>
        <div style={{
          display: "flex", gap: 8, justifyContent: "flex-end",
          padding: "4px 12px 12px",
        }}>
          <button
            onClick={onCancel}
            style={{
              height: 30, padding: "0 14px",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 7,
              color: "rgba(255,255,255,0.8)",
              fontSize: s(12),
              fontFamily: "system-ui,sans-serif",
              cursor: "pointer",
            }}
          >
            {t ? t("git.status.cancel") : "Cancel"}
          </button>
          <button
            ref={confirmBtnRef}
            onClick={onConfirm}
            style={{
              height: 30, padding: "0 14px",
              background: accentBg,
              border: "1px solid " + accentBorder,
              borderRadius: 7,
              color: accent,
              fontSize: s(12),
              fontFamily: "system-ui,sans-serif",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {confirmLabel || (t ? t("git.status.confirm") : "Confirm")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function FileSection({ title, files, s, pickCode, action, onAction, onRevert, onIgnore, onBulkAction, bulkActionTitle, style, t }) {
  const BulkIcon = action === "stage" ? Plus : Minus;
  return (
    <div style={style}>
      <div style={{
        display: "flex",
        alignItems: "center",
        color: "rgba(255,255,255,0.4)",
        fontSize: s(10),
        fontFamily: "'JetBrains Mono',monospace",
        letterSpacing: ".08em",
        marginBottom: 6,
      }}>
        <span style={{ flex: 1 }}>{title}</span>
        {onBulkAction && (
          <RowIconBtn onClick={onBulkAction} title={bulkActionTitle}>
            <BulkIcon size={12} strokeWidth={1.8} />
          </RowIconBtn>
        )}
      </div>
      {files.map((f) => (
        <FileRow
          key={f.path + ":" + action}
          file={f}
          s={s}
          letter={letterFor(pickCode(f))}
          action={action}
          onAction={onAction}
          onRevert={onRevert}
          onIgnore={onIgnore}
          t={t}
        />
      ))}
    </div>
  );
}

function RowIconBtn({ onClick, title, children }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={rowIconBtnStyle}
      onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.95)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.5)"; }}
    >
      {children}
    </button>
  );
}

function FileRow({ file, s, letter, action, onAction, onRevert, onIgnore, t }) {
  const [hover, setHover] = useState(false);
  const StageIcon = action === "stage" ? Plus : Minus;
  const stageTitle = action === "stage"
    ? (t ? t("git.status.stage") : "Stage")
    : (t ? t("git.status.unstage") : "Unstage");
  const untracked = file.index === "?";
  const revertTitle = untracked
    ? (t ? t("git.status.deleteUntracked") : "Delete (untracked)")
    : (t ? t("git.status.discardChangesTitle") : "Discard changes");
  const ignoreTitle = t ? t("git.status.addToGitignore") : "Add to .gitignore";
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", gap: 6, alignItems: "center",
        fontFamily: "'JetBrains Mono',monospace", fontSize: s(11),
        padding: "2px 0", color: "rgba(255,255,255,0.7)",
      }}
    >
      <span style={{ width: 14, color: STATUS_COLORS[letter] || "rgba(255,255,255,0.6)" }}>{letter}</span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{file.path}</span>
      <div style={{ display: "flex", gap: 2, visibility: hover ? "visible" : "hidden" }}>
        {onRevert && (
          <RowIconBtn onClick={() => onRevert(file.path, untracked)} title={revertTitle}>
            <Undo2 size={12} strokeWidth={1.8} />
          </RowIconBtn>
        )}
        {onIgnore && untracked && (
          <RowIconBtn onClick={() => onIgnore(file.path)} title={ignoreTitle}>
            <RefreshCwOff size={12} strokeWidth={1.8} />
          </RowIconBtn>
        )}
        <RowIconBtn onClick={() => onAction(file.path)} title={stageTitle}>
          <StageIcon size={12} strokeWidth={1.8} />
        </RowIconBtn>
      </div>
    </div>
  );
}
