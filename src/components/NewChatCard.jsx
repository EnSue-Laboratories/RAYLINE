import { useState, useRef, useEffect, useCallback, forwardRef } from "react";
import { createPortal } from "react-dom";
import { Paperclip, X, GitBranch, GitFork, Link2 } from "lucide-react";
import ModelPicker from "./ModelPicker";
import ProjectPicker from "./ProjectPicker";
import { useFontScale } from "../contexts/FontSizeContext";

const MENU_GAP = 6;
const VIEWPORT_PADDING = 8;

function clamp(value, min, max) {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

function getFloatingMenuLayout(rect, preferredWidth, preferredMaxHeight) {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const width = Math.min(preferredWidth, Math.max(0, viewportWidth - VIEWPORT_PADDING * 2));
  const maxHeight = Math.min(preferredMaxHeight, viewportHeight - VIEWPORT_PADDING * 2);
  const spaceBelow = viewportHeight - rect.bottom - MENU_GAP - VIEWPORT_PADDING;
  const spaceAbove = rect.top - MENU_GAP - VIEWPORT_PADDING;
  const placeAbove = spaceBelow < Math.min(maxHeight, 220) && spaceAbove > spaceBelow;

  return {
    top: placeAbove
      ? Math.max(VIEWPORT_PADDING, rect.top - MENU_GAP - maxHeight)
      : Math.min(rect.bottom + MENU_GAP, viewportHeight - VIEWPORT_PADDING - maxHeight),
    left: clamp(
      rect.left,
      VIEWPORT_PADDING,
      viewportWidth - width - VIEWPORT_PADDING
    ),
    width,
    maxHeight,
  };
}

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
  const [error, setError] = useState(null);
  const [creatingChat, setCreatingChat] = useState(false);

  // Issue search state
  const [showIssueSearch, setShowIssueSearch] = useState(false);
  const [issueSearchQuery, setIssueSearchQuery] = useState("");
  const [issueList, setIssueList] = useState([]);
  const [issueLoading, setIssueLoading] = useState(false);
  const issueSearchRef = useRef(null);
  const issueMenuRef = useRef(null);

  // Branch picker state
  const [showBranchSearch, setShowBranchSearch] = useState(false);
  const [branchSearchQuery, setBranchSearchQuery] = useState("");
  const [branchList, setBranchList] = useState([]);
  const [branchLoading, setBranchLoading] = useState(false);
  const [currentBranch, setCurrentBranch] = useState("");
  const [branchMode, setBranchMode] = useState(null); // "existing" | "new" | null
  const [worktreeBaseBranch, setWorktreeBaseBranch] = useState("");
  const branchSearchRef = useRef(null);
  const branchMenuRef = useRef(null);

  const makeClaudiBranchName = useCallback((baseBranch) => {
    const suffix = Math.random().toString(36).slice(2, 8);
    const base = (baseBranch || "claudi").trim();
    return `${base}-claudi-${suffix}`;
  }, []);

  // Auto-focus textarea on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Escape key handler
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") {
        if (showIssueSearch) { setShowIssueSearch(false); return; }
        if (showBranchSearch) { setShowBranchSearch(false); return; }
        onCancel();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onCancel, showIssueSearch, showBranchSearch]);

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

  // Close branch search on outside click
  useEffect(() => {
    if (!showBranchSearch) return;
    const handler = (e) => {
      if (branchSearchRef.current?.contains(e.target) || branchMenuRef.current?.contains(e.target)) return;
      setShowBranchSearch(false);
      setBranchSearchQuery("");
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showBranchSearch]);

  // Load available branches for the selected project
  useEffect(() => {
    if (!selectedCwd || !window.api?.gitBranches) {
      setBranchList([]);
      setCurrentBranch("");
      setBranchLoading(false);
      return;
    }

    let cancelled = false;
    setBranchLoading(true);

    (async () => {
      try {
        const info = await window.api.gitBranches(selectedCwd);
        if (cancelled) return;
        const current = info?.current || "";
        setCurrentBranch(current);
        setBranchList(info?.branches || []);
        setWorktreeBaseBranch((prev) => prev || current);
        setBranch((prev) => prev || current);
        setBranchMode((prev) => prev || (current ? "existing" : null));
      } catch {
        if (!cancelled) {
          setCurrentBranch("");
          setBranchList([]);
        }
      } finally {
        if (!cancelled) setBranchLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [selectedCwd]);

  // Auto-grow textarea
  const autoGrow = useCallback((el) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, []);

  const handleCreate = useCallback(async () => {
    const trimmedPrompt = prompt.trim();
    let trimmedBranch = branch.trim();
    let nextBranchMode = branchMode;
    let nextWorktreeBaseBranch = worktreeBaseBranch || currentBranch || "";

    if (!trimmedPrompt || creatingChat) return;

    if ((trimmedBranch || worktree) && !selectedCwd) {
      setError("Select a project before creating a branch or worktree.");
      return;
    }

    if (worktree) {
      if (nextBranchMode === "existing" && trimmedBranch) {
        nextWorktreeBaseBranch = trimmedBranch;
        trimmedBranch = makeClaudiBranchName(trimmedBranch);
        nextBranchMode = "new";
      } else if (!trimmedBranch && nextWorktreeBaseBranch) {
        trimmedBranch = makeClaudiBranchName(nextWorktreeBaseBranch);
        nextBranchMode = "new";
      } else if (!trimmedBranch) {
        setError("Pick a base branch first.");
        return;
      }
    }

    setError(null);
    setCreatingChat(true);
    try {
      await onCreateChat({
        cwd: selectedCwd,
        prompt: trimmedPrompt,
        model,
        branch: trimmedBranch || undefined,
        branchMode: nextBranchMode || "new",
        worktree,
        worktreeBaseBranch: worktree ? (nextWorktreeBaseBranch || undefined) : undefined,
        issueContext: issueContext || undefined,
        attachments: attachments.length ? attachments : undefined,
      });
    } catch (createError) {
      setError(createError?.message || "Failed to create chat.");
    } finally {
      setCreatingChat(false);
    }
  }, [attachments, branch, branchMode, creatingChat, currentBranch, issueContext, makeClaudiBranchName, model, onCreateChat, prompt, selectedCwd, worktree, worktreeBaseBranch]);

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

  const handleProjectChange = useCallback((nextCwd) => {
    setSelectedCwd(nextCwd);
    setBranch("");
    setBranchMode(null);
    setWorktreeBaseBranch("");
    setBranchSearchQuery("");
    setShowBranchSearch(false);
    setError(null);
  }, []);

  const handleBrowseProject = useCallback(async () => {
    const folder = await onPickFolder?.();
    if (!folder) return;
    handleProjectChange(folder);
  }, [handleProjectChange, onPickFolder]);

  const openBranchPicker = useCallback(() => {
    if (!selectedCwd) {
      setError("Select a project before choosing a branch.");
      return;
    }
    setError(null);
    setBranchSearchQuery(worktree ? "" : branch);
    setShowBranchSearch((prev) => !prev);
  }, [branch, selectedCwd, worktree]);

  const selectExistingBranch = useCallback((name) => {
    if (worktree) {
      setWorktreeBaseBranch(name);
      setBranch(name);
      setBranchMode("existing");
    } else {
      setBranch(name);
      setBranchMode("existing");
    }
    setBranchSearchQuery("");
    setShowBranchSearch(false);
    setError(null);
  }, [worktree]);

  const useCustomBranch = useCallback((value) => {
    const nextBranch = value.trim();
    if (!nextBranch) return;
    setBranch(nextBranch);
    setBranchMode("new");
    if (worktree && !worktreeBaseBranch) {
      setWorktreeBaseBranch(currentBranch || "");
    }
    setBranchSearchQuery("");
    setShowBranchSearch(false);
    setError(null);
  }, [currentBranch, worktree, worktreeBaseBranch]);

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

  const filteredBranches = branchList.filter((name) =>
    branchSearchQuery
      ? name.toLowerCase().includes(branchSearchQuery.toLowerCase())
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
    gap: 6,
    padding: "5px 11px",
    background: active ? "rgba(170,210,255,0.1)" : "rgba(255,255,255,0.025)",
    border: `1px solid ${active ? "rgba(170,210,255,0.18)" : "rgba(255,255,255,0.05)"}`,
    borderRadius: 999,
    color: active ? "rgba(225,240,255,0.94)" : "rgba(255,255,255,0.5)",
    fontSize: s(10.5),
    fontFamily: "system-ui, sans-serif",
    fontWeight: 600,
    cursor: "pointer",
    transition: "all .2s",
    letterSpacing: ".01em",
    boxShadow: active ? "0 10px 24px rgba(20,30,50,0.16)" : "none",
  });

  const chipIconStyle = {
    width: 13,
    height: 13,
    flexShrink: 0,
    strokeWidth: 2,
  };

  const branchLabel = worktree
    ? (branchMode === "new" && branch ? branch : (worktreeBaseBranch || currentBranch || "Base"))
    : (branch || currentBranch || "Branch");
  const issueLabel = issueContext ? `#${issueContext.match(/Issue #(\d+)/)?.[1] || ""}` : "Issue";

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        flex: 1,
        padding: 24,
        minHeight: 0,
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
        maxHeight: "100%",
        overflowY: "auto",
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
            <Paperclip style={chipIconStyle} />
            File
          </button>

          {/* Branch — searchable typeahead */}
          <div ref={branchSearchRef} style={{ position: "relative" }}>
            <button onClick={openBranchPicker} style={toolBtnStyle(!!branch)}>
              <GitBranch style={chipIconStyle} />
              <span style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {branchLabel}
              </span>
            </button>

            {showBranchSearch && createPortal(
              <BranchSearchDropdown
                ref={branchMenuRef}
                anchorRef={branchSearchRef}
                s={s}
                query={branchSearchQuery}
                onQueryChange={setBranchSearchQuery}
                branches={filteredBranches}
                loading={branchLoading}
                currentBranch={currentBranch}
                currentValue={branch}
                baseBranch={worktreeBaseBranch || currentBranch}
                worktree={worktree}
                onSelectBranch={selectExistingBranch}
                onUseCustomBranch={useCustomBranch}
              />,
              document.body
            )}
          </div>

          {/* Worktree — create new worktree */}
          <button onClick={() => setWorktree(v => !v)} style={toolBtnStyle(worktree)}>
            <GitFork style={chipIconStyle} />
            {worktree ? "Tree on" : "Tree"}
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
              <Link2 style={chipIconStyle} />
              {issueLabel}
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
            onChange={handleProjectChange}
            allCwdRoots={allCwdRoots}
            projects={projects}
            onBrowse={handleBrowseProject}
          />
          <span style={{
            fontSize: s(10), color: "rgba(255,255,255,0.2)",
            fontFamily: "'JetBrains Mono', monospace", letterSpacing: ".04em",
          }}>
            {creatingChat ? "Creating..." : "Enter to create"}
          </span>
        </div>

        {error && (
          <div style={{
            fontSize: s(10),
            color: "rgba(255,180,180,0.7)",
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Issue search dropdown ──────────────────────────────────────── */

const IssueSearchDropdown = forwardRef(function IssueSearchDropdown(
  { anchorRef, s, query, onQueryChange, issues, loading, onSelect },
  ref
) {
  const [pos, setPos] = useState(null);
  const updatePosition = useCallback(() => {
    if (!anchorRef?.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setPos(getFloatingMenuLayout(rect, 340, 300));
  }, [anchorRef]);

  useEffect(() => {
    if (!anchorRef?.current) return;
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    const ro = new ResizeObserver(updatePosition);
    ro.observe(anchorRef.current);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      ro.disconnect();
    };
  }, [anchorRef, updatePosition]);

  if (!pos) return null;

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        zIndex: 500,
        width: pos.width,
        maxHeight: pos.maxHeight,
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
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
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

const BranchSearchDropdown = forwardRef(function BranchSearchDropdown(
  { anchorRef, s, query, onQueryChange, branches, loading, currentBranch, currentValue, baseBranch, worktree, onSelectBranch, onUseCustomBranch },
  ref
) {
  const [pos, setPos] = useState(null);
  const trimmedQuery = query.trim();
  const exactBranchName = branches.find((branch) => branch.toLowerCase() === trimmedQuery.toLowerCase()) || null;
  const updatePosition = useCallback(() => {
    if (!anchorRef?.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setPos(getFloatingMenuLayout(rect, 360, 320));
  }, [anchorRef]);

  useEffect(() => {
    if (!anchorRef?.current) return;
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    const ro = new ResizeObserver(updatePosition);
    ro.observe(anchorRef.current);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      ro.disconnect();
    };
  }, [anchorRef, updatePosition]);

  if (!pos) return null;

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        zIndex: 500,
        width: pos.width,
        maxHeight: pos.maxHeight,
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
        placeholder={worktree ? "Pick a base or type a tree..." : "Find or type a branch..."}
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && trimmedQuery) {
            e.preventDefault();
            if (exactBranchName) onSelectBranch(exactBranchName);
            else onUseCustomBranch(trimmedQuery);
          }
        }}
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

      {worktree && currentValue && (
        <div
          style={{
            padding: "8px 10px 4px",
            fontSize: s(9),
            fontFamily: "'JetBrains Mono',monospace",
            color: "rgba(255,255,255,0.3)",
            letterSpacing: ".04em",
          }}
        >
          TREE {currentValue}
          {baseBranch ? ` · FROM ${baseBranch}` : ""}
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {trimmedQuery && !exactBranchName && (
          <button
            onClick={() => onUseCustomBranch(trimmedQuery)}
            style={{
              display: "flex",
              width: "100%",
              padding: "9px 10px",
              background: "transparent",
              border: "none",
              borderRadius: 7,
              color: "rgba(180,220,255,0.82)",
              fontSize: s(11),
              fontFamily: "'JetBrains Mono',monospace",
              cursor: "pointer",
              textAlign: "left",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            {worktree ? `Use "${trimmedQuery}" as the new worktree branch` : `Use "${trimmedQuery}" as a new branch`}
          </button>
        )}

        {loading && (
          <div style={{ padding: "12px 10px", fontSize: s(10), color: "rgba(255,255,255,0.3)", fontFamily: "'JetBrains Mono',monospace" }}>
            Loading...
          </div>
        )}
        {!loading && branches.length === 0 && (
          <div style={{ padding: "12px 10px", fontSize: s(10), color: "rgba(255,255,255,0.3)", fontFamily: "'JetBrains Mono',monospace" }}>
            No branches found
          </div>
        )}

        {branches.map((branchName) => (
          <button
            key={branchName}
            onClick={() => onSelectBranch(branchName)}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              gap: 2,
              width: "100%",
              padding: "8px 10px",
              background: "transparent",
              border: "none",
              borderRadius: 7,
              color: branchName === currentBranch ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.55)",
              fontSize: s(11),
              fontFamily: "'JetBrains Mono',monospace",
              cursor: "pointer",
              textAlign: "left",
              transition: "all .12s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <span>{branchName}</span>
            {branchName === currentBranch && (
              <span style={{ fontSize: s(8.5), color: "rgba(255,255,255,0.25)", letterSpacing: ".04em" }}>
                CURRENT
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
});
