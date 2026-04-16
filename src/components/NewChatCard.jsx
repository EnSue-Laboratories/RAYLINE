import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Paperclip, X } from "lucide-react";
import ModelPicker from "./ModelPicker";
import ProjectPicker from "./ProjectPicker";
import { useFontScale } from "../contexts/FontSizeContext";

export default function NewChatCard({
  onCreateChat,
  defaultCwd,
  defaultModel,
  allCwdRoots,
  projects,
  onPickFolder,
  onCancel,
}) {
  const s = useFontScale();
  const textareaRef = useRef(null);

  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState(defaultModel || "sonnet");
  const [selectedCwd, setSelectedCwd] = useState(defaultCwd);
  const [branch, setBranch] = useState("");
  const [worktree, setWorktree] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [issueContext, setIssueContext] = useState(null);

  // Issue search state
  const [showIssueSearch, setShowIssueSearch] = useState(false);
  const [issueSearchQuery, setIssueSearchQuery] = useState("");
  const [issueList, setIssueList] = useState([]);
  const [issueLoading, setIssueLoading] = useState(false);
  const issueSearchRef = useRef(null);
  const issueMenuRef = useRef(null);

  // Branch input state
  const [showBranchInput, setShowBranchInput] = useState(false);

  // Auto-focus textarea on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Escape key handler
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") {
        if (showIssueSearch) { setShowIssueSearch(false); return; }
        if (showBranchInput) { setShowBranchInput(false); return; }
        onCancel();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onCancel, showIssueSearch, showBranchInput]);

  // Close issue search on outside click
  useEffect(() => {
    if (!showIssueSearch) return;
    const handler = (e) => {
      if (issueSearchRef.current?.contains(e.target) || issueMenuRef.current?.contains(e.target)) return;
      setShowIssueSearch(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showIssueSearch]);

  // Load issues when search opens
  useEffect(() => {
    if (!showIssueSearch || !selectedCwd) return;
    let cancelled = false;
    setIssueLoading(true);
    (async () => {
      try {
        const repoName = await window.api?.ghGetRepoName?.(selectedCwd);
        if (!repoName || cancelled) return;
        const issues = await window.api?.ghListIssues?.(repoName, "open");
        if (!cancelled && issues) setIssueList(issues);
      } catch { /* ignore */ }
      finally { if (!cancelled) setIssueLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [showIssueSearch, selectedCwd]);

  // Auto-grow textarea
  const autoGrow = useCallback((el) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, []);

  const handleCreate = useCallback(() => {
    if (!prompt.trim()) return;
    onCreateChat({
      cwd: selectedCwd,
      prompt: prompt.trim(),
      model,
      branch: branch.trim() || undefined,
      worktree,
      issueContext: issueContext || undefined,
      attachments: attachments.length ? attachments : undefined,
    });
  }, [prompt, issueContext, onCreateChat, selectedCwd, model, branch, worktree, attachments]);

  // Enter to create, Shift+Enter for newline
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleCreate();
      }
    },
    [handleCreate]
  );

  const handleAttach = useCallback(async () => {
    const files = await window.api?.selectFiles?.();
    if (files?.length) setAttachments((prev) => [...prev, ...files.map(f => ({ type: "file", name: f.split("/").pop(), path: f }))]);
  }, []);

  const removeAttachment = useCallback((idx) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  // Paste handler for images
  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        const reader = new FileReader();
        reader.onload = (ev) => {
          setAttachments((prev) => [...prev, { type: "image", dataUrl: ev.target.result, name: file.name || "image" }]);
        };
        reader.readAsDataURL(file);
      }
    }
  };

  // Drop handler for files and images
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const files = e.dataTransfer?.files;
    if (!files) return;
    for (const file of files) {
      const filePath = window.api?.getFilePath?.(file) || file.path || null;
      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          setAttachments((prev) => [...prev, { type: "image", dataUrl: ev.target.result, name: file.name, path: filePath }]);
        };
        reader.readAsDataURL(file);
      } else {
        setAttachments((prev) => [...prev, { type: "file", name: file.name, path: filePath || file.name }]);
      }
    }
  };

  const [dragOver, setDragOver] = useState(false);

  const selectIssue = useCallback(async (issue) => {
    setIssueContext(`Issue #${issue.number}: ${issue.title}\n\n${issue.body || ""}`);
    setShowIssueSearch(false);
    setIssueSearchQuery("");
  }, []);

  const filteredIssues = issueList.filter(i =>
    issueSearchQuery
      ? `#${i.number} ${i.title}`.toLowerCase().includes(issueSearchQuery.toLowerCase())
      : true
  );

  const inputBase = {
    background: "transparent",
    border: "none",
    outline: "none",
    color: "rgba(255,255,255,0.85)",
    fontFamily: "system-ui, sans-serif",
  };

  const toolBtnStyle = (active) => ({
    display: "flex",
    alignItems: "center",
    gap: 4,
    padding: "4px 10px",
    background: active ? "rgba(180,220,255,0.08)" : "rgba(255,255,255,0.02)",
    border: `1px solid ${active ? "rgba(180,220,255,0.15)" : "rgba(255,255,255,0.04)"}`,
    borderRadius: 7,
    color: active ? "rgba(180,220,255,0.85)" : "rgba(255,255,255,0.4)",
    fontSize: s(10),
    fontFamily: "'JetBrains Mono',monospace",
    cursor: "pointer",
    transition: "all .2s",
    letterSpacing: ".04em",
  });

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        flex: 1,
        padding: 24,
      }}
      onDrop={handleDrop}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
    >
      <div style={{
        maxWidth: 600,
        width: "100%",
        background: dragOver ? "rgba(180,220,255,0.04)" : "rgba(8,8,12,0.55)",
        backdropFilter: "blur(48px) saturate(1.2)",
        border: `1px solid ${dragOver ? "rgba(180,220,255,0.12)" : "rgba(255,255,255,0.06)"}`,
        borderRadius: 14,
        padding: 20,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        transition: "all .2s",
      }}>
        {/* Main textarea */}
        <textarea
          ref={textareaRef}
          placeholder="What do you want to do?"
          value={prompt}
          onChange={(e) => {
            setPrompt(e.target.value);
            autoGrow(e.target);
          }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          rows={4}
          style={{
            ...inputBase,
            fontSize: s(13),
            lineHeight: 1.6,
            resize: "none",
            minHeight: 100,
            maxHeight: 300,
            overflowY: "auto",
            padding: "8px 0",
          }}
        />

        {/* Chips area: issue + attachments */}
        {(issueContext || attachments.length > 0) && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {issueContext && (
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "3px 8px",
                background: "rgba(140,180,255,0.1)",
                border: "1px solid rgba(140,180,255,0.15)",
                borderRadius: 6, fontSize: s(10),
                fontFamily: "'JetBrains Mono', monospace",
                color: "rgba(180,210,255,0.8)",
              }}>
                {issueContext.split("\n")[0]}
                <button onClick={() => setIssueContext(null)} style={{
                  background: "none", border: "none", color: "rgba(255,255,255,0.3)",
                  cursor: "pointer", padding: 0, display: "flex",
                }}>
                  <X size={10} />
                </button>
              </span>
            )}
            {attachments.map((f, i) => (
              <span key={i} style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "3px 8px",
                background: f.type === "image" ? "rgba(180,255,200,0.06)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${f.type === "image" ? "rgba(180,255,200,0.1)" : "rgba(255,255,255,0.06)"}`,
                borderRadius: 6, fontSize: s(10),
                fontFamily: "'JetBrains Mono', monospace",
                color: "rgba(255,255,255,0.5)",
              }}>
                {f.type === "image" && f.dataUrl && (
                  <img src={f.dataUrl} alt="" style={{ width: 14, height: 14, borderRadius: 2, objectFit: "cover" }} />
                )}
                {f.name}
                <button onClick={() => removeAttachment(i)} style={{
                  background: "none", border: "none", color: "rgba(255,255,255,0.3)",
                  cursor: "pointer", padding: 0, display: "flex",
                }}>
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Toolbar row */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <ModelPicker value={model} onChange={setModel} />

          {/* Attach */}
          <button onClick={handleAttach} style={toolBtnStyle(false)}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.04)"; }}
          >
            <Paperclip size={11} strokeWidth={2} />
          </button>

          {/* Branch — text toggle */}
          {!showBranchInput ? (
            <button onClick={() => setShowBranchInput(true)} style={toolBtnStyle(!!branch)}>
              {branch ? `branch: ${branch}` : "branch"}
            </button>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <input
                autoFocus
                type="text"
                placeholder="branch-name"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setShowBranchInput(false); } }}
                onBlur={() => setShowBranchInput(false)}
                style={{
                  ...inputBase,
                  fontSize: s(10),
                  fontFamily: "'JetBrains Mono', monospace",
                  padding: "4px 8px",
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 6,
                  width: 140,
                  color: "rgba(255,255,255,0.6)",
                }}
              />
            </div>
          )}

          {/* Worktree — text toggle */}
          <button onClick={() => setWorktree(v => !v)} style={toolBtnStyle(worktree)}>
            {worktree ? "worktree: on" : "worktree"}
          </button>

          {/* Link issue — text toggle with searchable dropdown */}
          <div ref={issueSearchRef} style={{ position: "relative" }}>
            <button
              onClick={() => {
                if (issueContext) { setIssueContext(null); return; }
                setShowIssueSearch(v => !v);
              }}
              style={toolBtnStyle(!!issueContext)}
            >
              {issueContext ? issueContext.split("\n")[0].slice(0, 30) : "link issue"}
            </button>

            {showIssueSearch && createPortal(
              <IssueSearchDropdown
                ref={issueMenuRef}
                anchorRef={issueSearchRef}
                s={s}
                query={issueSearchQuery}
                onQueryChange={setIssueSearchQuery}
                issues={filteredIssues}
                loading={issueLoading}
                onSelect={selectIssue}
              />,
              document.body
            )}
          </div>
        </div>

        {/* Bottom bar */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          paddingTop: 4, borderTop: "1px solid rgba(255,255,255,0.04)",
        }}>
          <ProjectPicker
            value={selectedCwd}
            onChange={setSelectedCwd}
            allCwdRoots={allCwdRoots}
            projects={projects}
            onBrowse={onPickFolder}
          />
          <span style={{
            fontSize: s(10), color: "rgba(255,255,255,0.2)",
            fontFamily: "'JetBrains Mono', monospace", letterSpacing: ".04em",
          }}>
            Enter to create
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── Issue search dropdown ──────────────────────────────────────── */

import { forwardRef } from "react";

const IssueSearchDropdown = forwardRef(function IssueSearchDropdown(
  { anchorRef, s, query, onQueryChange, issues, loading, onSelect },
  ref
) {
  const [pos, setPos] = useState(null);

  useEffect(() => {
    if (!anchorRef?.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom + 6, left: rect.left });
  }, [anchorRef]);

  if (!pos) return null;

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        zIndex: 500,
        width: 340,
        maxHeight: 300,
        background: "rgba(8,8,12,0.55)",
        backdropFilter: "blur(48px) saturate(1.2)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 10,
        padding: 3,
        boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
        animation: "dropIn .15s ease",
        WebkitAppRegion: "no-drag",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <input
        autoFocus
        type="text"
        placeholder="Search issues..."
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "none",
          outline: "none",
          padding: "8px 10px",
          fontSize: s(11),
          fontFamily: "'JetBrains Mono',monospace",
          color: "rgba(255,255,255,0.8)",
          borderBottom: "1px solid rgba(255,255,255,0.04)",
          borderRadius: "7px 7px 0 0",
        }}
      />
      <div style={{ overflowY: "auto", maxHeight: 240 }}>
        {loading && (
          <div style={{ padding: "12px 10px", fontSize: s(10), color: "rgba(255,255,255,0.3)", fontFamily: "'JetBrains Mono',monospace" }}>
            Loading...
          </div>
        )}
        {!loading && issues.length === 0 && (
          <div style={{ padding: "12px 10px", fontSize: s(10), color: "rgba(255,255,255,0.3)", fontFamily: "'JetBrains Mono',monospace" }}>
            No issues found
          </div>
        )}
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
              color: "rgba(255,255,255,0.55)",
              fontSize: s(11),
              fontFamily: "system-ui, sans-serif",
              cursor: "pointer",
              textAlign: "left",
              transition: "all .12s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <span style={{
              fontSize: s(9), fontFamily: "'JetBrains Mono',monospace",
              color: "rgba(255,255,255,0.3)", flexShrink: 0,
            }}>
              #{issue.number}
            </span>
            <span style={{
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {issue.title}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
});
