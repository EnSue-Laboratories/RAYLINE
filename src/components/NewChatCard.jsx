import { useTranslator } from "../contexts/LocaleContext";
import { readDraft, writeDraft, clearDraft } from "../utils/composerDrafts";
import { useState, useRef, useEffect, useCallback, forwardRef } from "react";
import { createPortal } from "react-dom";
import { Paperclip, X, GitBranch, GitFork, Link2, ArrowLeft, ArrowRight } from "lucide-react";
import { ModelPickerWithMultica } from "../data/multicaModels.jsx";
import ProjectPicker from "./ProjectPicker";
import { useFontScale } from "../contexts/FontSizeContext";
import { clipboardItemsToAttachments, dataTransferHasFiles, fileListToAttachments } from "../utils/attachments";

const MENU_GAP = 6;
const VIEWPORT_PADDING = 8;
const SHEET_BG = "var(--pane-elevated)";
const SHEET_HOVER = "var(--pane-interaction-hover-fill, var(--pane-hover))";
const SHEET_ACTIVE = "var(--pane-interaction-active-fill, var(--pane-active))";
const SHEET_BORDER = "var(--pane-border)";

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
  defaultBranch,
  allCwdRoots,
  projects,
  onPickFolder,
  onCancel,
  developerMode = true,
  extraModels = [],
}) {
  const s = useFontScale();
  const t = useTranslator();
  const draftScope = `new-chat:${defaultCwd || "drafts"}`;
  const [savedDraft] = useState(() => readDraft(draftScope));
  const submittedRef = useRef(false);
  const textareaRef = useRef(null);
  const dragDepthRef = useRef(0);

  const [prompt, setPrompt] = useState(savedDraft.prompt || "");
  const [model, setModel] = useState(savedDraft.model || defaultModel || "sonnet");
  const [selectedCwd, setSelectedCwd] = useState(Object.prototype.hasOwnProperty.call(savedDraft, "cwd") ? savedDraft.cwd : defaultCwd);
  const [branch, setBranch] = useState(savedDraft.branch || "");
  const [worktree, setWorktree] = useState(savedDraft.worktree || false);
  const [worktreeName, setWorktreeName] = useState(savedDraft.worktreeName || "");
  const [attachments, setAttachments] = useState(savedDraft.attachments || []);
  const [issueContext, setIssueContext] = useState(savedDraft.issueContext || null);
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
  const [branchMode, setBranchMode] = useState(savedDraft.branchMode || null); // "existing" | "new" | null
  const branchSearchRef = useRef(null);
  const branchMenuRef = useRef(null);

  // Worktree name input state
  const [showTreeInput, setShowTreeInput] = useState(false);
  const treeBtnRef = useRef(null);
  const treeMenuRef = useRef(null);
  const isDraftSelection = selectedCwd == null;

  useEffect(() => {
    if (!submittedRef.current) writeDraft(draftScope, { prompt, model, cwd: selectedCwd, branch, branchMode, worktree, worktreeName, issueContext, attachments });
  }, [draftScope, prompt, model, selectedCwd, branch, branchMode, worktree, worktreeName, issueContext, attachments]);

  const makeClaudiBranchName = useCallback((baseBranch) => {
    const suffix = Math.random().toString(36).slice(2, 8);
    const base = (baseBranch || "rayline").trim();
    return `${base}-rayline-${suffix}`;
  }, []);

  // Auto-focus textarea on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    const closeMenus = () => { setShowIssueSearch(false); setShowBranchSearch(false); setShowTreeInput(false); };
    window.addEventListener("rayline:close-menus", closeMenus);
    return () => window.removeEventListener("rayline:close-menus", closeMenus);
  }, []);

  // Escape key handler
  useEffect(() => {
    const handler = (e) => {
      if (!textareaRef.current?.closest("[inert]") && e.key === "Escape" && !e.defaultPrevented && !e.isComposing && !creatingChat) {
        e.preventDefault();
        if (showIssueSearch) { setShowIssueSearch(false); return; }
        if (showBranchSearch) { setShowBranchSearch(false); return; }
        if (showTreeInput) { setShowTreeInput(false); return; }
        onCancel?.();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onCancel, showIssueSearch, showBranchSearch, showTreeInput, creatingChat]);

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

  // Close tree input on outside click
  useEffect(() => {
    if (!showTreeInput) return;
    const handler = (e) => {
      if (treeBtnRef.current?.contains(e.target) || treeMenuRef.current?.contains(e.target)) return;
      setShowTreeInput(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showTreeInput]);

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
        const branches = info?.branches || [];
        setCurrentBranch(current);
        setBranchList(branches);
        const preferred = defaultBranch && branches.includes(defaultBranch)
          ? defaultBranch
          : current;
        setBranch((prev) => prev || preferred);
        setBranchMode((prev) => prev || (preferred ? "existing" : null));
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
  }, [selectedCwd, defaultBranch]);

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
    let nextWorktreeBaseBranch;

    if (!trimmedPrompt || creatingChat) return;

    if ((trimmedBranch || worktree) && !selectedCwd) {
      setError(t("newChat.selectProjectBeforeBranchOrWorktree"));
      return;
    }

    if (worktree) {
      const base = trimmedBranch || currentBranch;
      if (!base) {
        setError(t("newChat.pickBaseBranchFirst"));
        return;
      }
      nextWorktreeBaseBranch = base;
      trimmedBranch = worktreeName.trim() || makeClaudiBranchName(base);
      nextBranchMode = "new";
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
        worktreeBaseBranch: worktree ? nextWorktreeBaseBranch : undefined,
        issueContext: issueContext || undefined,
        attachments: attachments.length ? attachments : undefined,
      });
      submittedRef.current = true;
      clearDraft(draftScope);
    } catch (createError) {
      setError(createError?.message || t("newChat.failedToCreateChat"));
    } finally {
      setCreatingChat(false);
    }
  }, [attachments, branch, branchMode, creatingChat, currentBranch, issueContext, makeClaudiBranchName, model, onCreateChat, prompt, selectedCwd, worktree, worktreeName, draftScope, t]);

  // Enter to create, Shift+Enter for newline
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
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
    setBranchSearchQuery("");
    setShowBranchSearch(false);
    setWorktree(false);
    setWorktreeName("");
    setShowTreeInput(false);
    setIssueContext(null);
    setIssueList([]);
    setShowIssueSearch(false);
    setIssueSearchQuery("");
    setError(null);
  }, []);

  const handleBrowseProject = useCallback(async () => {
    const folder = await onPickFolder?.();
    if (!folder) return;
    handleProjectChange(folder);
  }, [handleProjectChange, onPickFolder]);

  const openBranchPicker = useCallback(() => {
    if (!selectedCwd) {
      setError(t("newChat.selectProjectBeforeBranch"));
      return;
    }
    setError(null);
    setBranchSearchQuery("");
    const wasOpen = showBranchSearch;
    window.dispatchEvent(new Event("rayline:close-menus"));
    setShowBranchSearch(!wasOpen);
  }, [selectedCwd, t, showBranchSearch]);

  const selectExistingBranch = useCallback((name) => {
    setBranch(name);
    setBranchMode("existing");
    setBranchSearchQuery("");
    setShowBranchSearch(false);
    setError(null);
  }, []);

  const useCustomBranch = useCallback((value) => {
    const nextBranch = value.trim();
    if (!nextBranch) return;
    setBranch(nextBranch);
    setBranchMode(worktree ? "existing" : "new");
    setBranchSearchQuery("");
    setShowBranchSearch(false);
    setError(null);
  }, [worktree]);

  const openTreeInput = useCallback(() => {
    if (!selectedCwd) {
      setError(t("newChat.selectProjectBeforeWorktree"));
      return;
    }
    setError(null);
    setShowTreeInput((prev) => !prev);
  }, [selectedCwd, t]);

  const confirmTreeName = useCallback((value) => {
    setWorktreeName(value.trim());
    setWorktree(true);
    // A worktree's base must be an existing branch; if the user had typed a
    // new branch in the branch picker, fall back to the current branch.
    if (branchMode === "new") {
      setBranch(currentBranch || "");
      setBranchMode(currentBranch ? "existing" : null);
    }
    setShowTreeInput(false);
    setError(null);
  }, [branchMode, currentBranch]);

  const disableWorktree = useCallback(() => {
    setWorktree(false);
    setWorktreeName("");
    setShowTreeInput(false);
  }, []);

  const handlePaste = useCallback((e) => {
    const items = Array.from(e.clipboardData?.items || []);
    if (!items.some((item) => item?.kind === "file")) return;

    e.preventDefault();
    void clipboardItemsToAttachments(items).then((nextAttachments) => {
      if (nextAttachments.length === 0) return;
      setAttachments((prev) => [...prev, ...nextAttachments]);
    });
  }, []);

  const [dragOver, setDragOver] = useState(false);
  const resetDragState = useCallback(() => {
    dragDepthRef.current = 0;
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e) => {
    if (!dataTransferHasFiles(e.dataTransfer)) return;

    e.preventDefault();
    e.stopPropagation();
    resetDragState();

    void fileListToAttachments(e.dataTransfer?.files).then((nextAttachments) => {
      if (nextAttachments.length === 0) return;
      setAttachments((prev) => [...prev, ...nextAttachments]);
    });
  }, [resetDragState]);

  const handleDragEnter = useCallback((e) => {
    if (!dataTransferHasFiles(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current += 1;
    setDragOver(true);
  }, []);

  const handleDragOver = useCallback((e) => {
    if (!dataTransferHasFiles(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
    if (!dragOver) setDragOver(true);
  }, [dragOver]);

  const handleDragLeave = useCallback((e) => {
    if (!dataTransferHasFiles(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragOver(false);
  }, []);

  useEffect(() => {
    const handleWindowDrop = () => resetDragState();
    const handleWindowDragEnd = () => resetDragState();

    window.addEventListener("drop", handleWindowDrop);
    window.addEventListener("dragend", handleWindowDragEnd);

    return () => {
      window.removeEventListener("drop", handleWindowDrop);
      window.removeEventListener("dragend", handleWindowDragEnd);
    };
  }, [resetDragState]);

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
    color: "var(--text-primary)",
    fontFamily: "var(--font-ui)",
  };

  const toolBtnStyle = (active) => ({
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "5px 11px",
    background: active ? SHEET_ACTIVE : SHEET_HOVER,
    backdropFilter: active ? "var(--pane-interaction-active-filter, none)" : "var(--pane-interaction-hover-filter, none)",
    border: `1px solid ${active ? "var(--control-bg-active)" : SHEET_BORDER}`,
    borderRadius: 999,
    color: active ? "var(--text-primary)" : "var(--text-secondary)",
    fontSize: s(10.5),
    fontFamily: "var(--font-ui)",
    fontWeight: 600,
    cursor: "pointer",
    transition: "all .2s",
    letterSpacing: ".01em",
    boxShadow: active ? "var(--pane-interaction-active-shadow, inset 0 0 0 1px var(--control-border))" : "var(--pane-interaction-hover-shadow, none)",
  });

  const chipIconStyle = {
    width: 13,
    height: 13,
    flexShrink: 0,
    strokeWidth: 2,
  };

  const branchLabel = branch || currentBranch || (worktree ? t("newChat.base") : t("newChat.branch"));
  const treeLabel = worktreeName || t("newChat.tree");
  const issueLabel = issueContext ? `#${issueContext.match(/Issue #(\d+)/)?.[1] || ""}` : t("newChat.issue");

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        flex: 1,
        padding: 24,
        minHeight: 0,
        gap: 12,
      }}
      onDrop={handleDrop}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <div style={{
        maxWidth: 600,
        width: "100%",
        background: dragOver ? "var(--accent-bg)" : SHEET_BG,
        backdropFilter: "blur(48px) saturate(1.2)",
        border: `1px solid ${dragOver ? "var(--accent-border)" : SHEET_BORDER}`,
        borderRadius: 14,
        padding: "20px 20px 10px",
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
          placeholder={t("newChat.promptPlaceholder")}
          disabled={creatingChat}
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
                background: "var(--accent-bg-strong)",
                border: "1px solid var(--accent-border)",
                borderRadius: 6, fontSize: s(10),
                fontFamily: "var(--font-mono)",
                color: "var(--accent-text)",
              }}>
                {issueContext.split("\n")[0]}
                <button onClick={() => setIssueContext(null)} style={{
                  background: "none", border: "none", color: "var(--text-muted)",
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
                background: f.type === "image" ? "var(--success-bg)" : "var(--control-bg)",
                border: `1px solid ${f.type === "image" ? "var(--success-border)" : "var(--control-bg-strong)"}`,
                borderRadius: 6, fontSize: s(10),
                fontFamily: "var(--font-mono)",
                color: "var(--text-secondary)",
              }}>
                {f.type === "image" && f.dataUrl && (
                  <img src={f.dataUrl} alt="" style={{ width: 14, height: 14, borderRadius: 2, objectFit: "cover" }} />
                )}
                {f.name}
                <button onClick={() => removeAttachment(i)} style={{
                  background: "none", border: "none", color: "var(--text-muted)",
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
          <ModelPickerWithMultica value={model} onChange={setModel} extraModels={extraModels} />

          {/* Attach */}
          <button onClick={handleAttach} style={toolBtnStyle(false)}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--control-bg-active)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--control-bg)"; }}
          >
            <Paperclip style={chipIconStyle} />
            {t("newChat.file")}
          </button>

          {/* Branch — searchable typeahead */}
          {developerMode && !isDraftSelection && <div ref={branchSearchRef} style={{ position: "relative" }}>
            <button onClick={openBranchPicker} style={toolBtnStyle(!!branch)}>
              <GitBranch style={chipIconStyle} />
              <span style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {branchLabel}
              </span>
            </button>

            {showBranchSearch && createPortal(
              <BranchSearchDropdown
                onClose={() => setShowBranchSearch(false)}
                ref={branchMenuRef}
                anchorRef={branchSearchRef}
                s={s}
                query={branchSearchQuery}
                onQueryChange={setBranchSearchQuery}
                branches={filteredBranches}
                loading={branchLoading}
                currentBranch={currentBranch}
                worktree={worktree}
                onSelectBranch={selectExistingBranch}
                onUseCustomBranch={useCustomBranch}
              />,
              document.body
            )}
          </div>}

          {/* Worktree — inline name input */}
          {developerMode && !isDraftSelection && <div ref={treeBtnRef} style={{ position: "relative" }}>
            <button onClick={openTreeInput} style={toolBtnStyle(worktree)}>
              <GitFork style={chipIconStyle} />
              <span style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {treeLabel}
              </span>
            </button>

            {showTreeInput && createPortal(
              <WorktreeInputDropdown
                onClose={() => setShowTreeInput(false)}
                ref={treeMenuRef}
                anchorRef={treeBtnRef}
                s={s}
                initialValue={worktreeName}
                active={worktree}
                baseBranch={branch || currentBranch}
                onConfirm={confirmTreeName}
                onDisable={disableWorktree}
              />,
              document.body
            )}
          </div>}

          {/* Link issue — text toggle with searchable dropdown */}
          {developerMode && !isDraftSelection && <div ref={issueSearchRef} style={{ position: "relative" }}>
            <button
              onClick={() => {
                if (issueContext) { setIssueContext(null); return; }
                const wasOpen = showIssueSearch;
                window.dispatchEvent(new Event("rayline:close-menus"));
                setShowIssueSearch(!wasOpen);
              }}
              style={toolBtnStyle(!!issueContext)}
            >
              <Link2 style={chipIconStyle} />
              {issueLabel}
            </button>

            {showIssueSearch && createPortal(
              <IssueSearchDropdown
                onClose={() => setShowIssueSearch(false)}
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
          </div>}
        </div>

        {/* Bottom bar */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8,
          paddingTop: 10, borderTop: "1px solid var(--pane-border)",
        }}>
          <ProjectPicker
            value={selectedCwd}
            onChange={handleProjectChange}
            allCwdRoots={allCwdRoots}
            projects={projects}
            onBrowse={handleBrowseProject}
          />
          <button type="button" disabled={creatingChat || !prompt.trim()} onClick={handleCreate} aria-label={t("newChat.create")}
            style={{ ...toolBtnStyle(true), marginLeft: "auto", opacity: creatingChat || !prompt.trim() ? 0.5 : 1 }}>
            {creatingChat ? t("newChat.creating") : t("newChat.create")}<ArrowRight size={13} />
          </button>
        </div>

        {error && (
          <div style={{
            fontSize: s(10),
            color: "var(--danger-text)",
            fontFamily: "var(--font-mono)",
          }}>
            {error}
          </div>
        )}
      </div>
      {onCancel && (
        <button type="button" onClick={onCancel} disabled={creatingChat} aria-label={t("newChat.back")}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", flexWrap: "wrap", maxWidth: "100%", gap: 6, padding: "6px 12px", background: "var(--control-bg)", border: "1px solid var(--control-border)", borderRadius: 7, color: "var(--text-secondary)", cursor: "pointer", fontSize: s(11) }}>
          <ArrowLeft size={13} />{t("newChat.back")}<span style={{ color: "var(--text-muted)", fontSize: s(10) }}>{t("newChat.cancelHint")}</span>
        </button>
      )}
    </div>
  );
}

/* ── Issue search dropdown ──────────────────────────────────────── */

const IssueSearchDropdown = forwardRef(function IssueSearchDropdown(
  { anchorRef, s, onClose, query, onQueryChange, issues, loading, onSelect },
  ref
) {
  const t = useTranslator();
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
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.nativeEvent.isComposing) {
          event.preventDefault(); event.stopPropagation(); onClose(); anchorRef.current?.querySelector("button")?.focus();
        }
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        zIndex: 500,
        width: pos.width,
        maxHeight: pos.maxHeight,
        background: SHEET_BG,
        backdropFilter: "blur(48px) saturate(1.2)",
        border: "1px solid var(--pane-border)",
        borderRadius: 10,
        padding: 3,
        boxShadow: "var(--shadow-md)",
        animation: "dropIn .15s ease",
        WebkitAppRegion: "no-drag",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <input
        autoFocus
        type="text"
        placeholder={t("newChat.searchIssues")}
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        style={{
          background: SHEET_HOVER,
          border: "none",
          outline: "none",
          padding: "8px 10px",
          fontSize: s(11),
          fontFamily: "var(--font-mono)",
          color: "var(--text-primary)",
          borderBottom: "1px solid var(--pane-border)",
          borderRadius: "7px 7px 0 0",
        }}
      />
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {loading && (
          <div style={{ padding: "12px 10px", fontSize: s(10), color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
            {t("newChat.loading")}
          </div>
        )}
        {!loading && issues.length === 0 && (
          <div style={{ padding: "12px 10px", fontSize: s(10), color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
            {t("newChat.noIssuesFound")}
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
              color: "var(--text-secondary)",
              fontSize: s(11),
              fontFamily: "var(--font-ui)",
              cursor: "pointer",
              textAlign: "left",
              transition: "all .12s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = SHEET_HOVER; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <span style={{
              fontSize: s(9), fontFamily: "var(--font-mono)",
              color: "var(--text-muted)", flexShrink: 0,
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
  { anchorRef, s, onClose, query, onQueryChange, branches, loading, currentBranch, worktree, onSelectBranch, onUseCustomBranch },
  ref
) {
  const t = useTranslator();
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
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.nativeEvent.isComposing) {
          event.preventDefault(); event.stopPropagation(); onClose(); anchorRef.current?.querySelector("button")?.focus();
        }
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        zIndex: 500,
        width: pos.width,
        maxHeight: pos.maxHeight,
        background: SHEET_BG,
        backdropFilter: "blur(48px) saturate(1.2)",
        border: "1px solid var(--pane-border)",
        borderRadius: 10,
        padding: 3,
        boxShadow: "var(--shadow-md)",
        animation: "dropIn .15s ease",
        WebkitAppRegion: "no-drag",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <input
        autoFocus
        type="text"
        placeholder={worktree ? t("newChat.pickBaseBranch") : t("newChat.findOrTypeBranch")}
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && trimmedQuery && !e.nativeEvent.isComposing && e.keyCode !== 229) {
            e.preventDefault();
            if (exactBranchName) onSelectBranch(exactBranchName);
            else if (!worktree) onUseCustomBranch(trimmedQuery);
          }
        }}
        style={{
          background: SHEET_HOVER,
          border: "none",
          outline: "none",
          padding: "8px 10px",
          fontSize: s(11),
          fontFamily: "var(--font-mono)",
          color: "var(--text-primary)",
          borderBottom: "1px solid var(--pane-border)",
          borderRadius: "7px 7px 0 0",
        }}
      />

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {trimmedQuery && !exactBranchName && !worktree && (
          <button
            onClick={() => onUseCustomBranch(trimmedQuery)}
            style={{
              display: "flex",
              width: "100%",
              padding: "9px 10px",
              background: "transparent",
              border: "none",
              borderRadius: 7,
              color: "var(--accent-text)",
              fontSize: s(11),
              fontFamily: "var(--font-mono)",
              cursor: "pointer",
              textAlign: "left",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = SHEET_HOVER; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            {t("newChat.useAsNewBranch", { value: trimmedQuery })}
          </button>
        )}

        {loading && (
          <div style={{ padding: "12px 10px", fontSize: s(10), color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
            {t("newChat.loading")}
          </div>
        )}
        {!loading && branches.length === 0 && (
          <div style={{ padding: "12px 10px", fontSize: s(10), color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
            {t("newChat.noBranchesFound")}
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
              color: branchName === currentBranch ? "var(--text-primary)" : "var(--text-secondary)",
              fontSize: s(11),
              fontFamily: "var(--font-mono)",
              cursor: "pointer",
              textAlign: "left",
              transition: "all .12s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = SHEET_HOVER; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <span>{branchName}</span>
            {branchName === currentBranch && (
              <span style={{ fontSize: s(8.5), color: "var(--text-faint)", letterSpacing: ".04em" }}>
                {t("newChat.currentBranch")}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
});

function getNeutralDropdownItemStyle(s) {
  return {
    display: "flex",
    width: "100%",
    padding: "8px 10px",
    background: "transparent",
    border: "none",
    borderRadius: 7,
    color: "var(--text-secondary)",
    fontSize: s(11),
    fontFamily: "var(--font-mono)",
    cursor: "pointer",
    textAlign: "left",
    transition: "all .12s",
  };
}

/* ── Worktree name input ────────────────────────────────────────── */

const WorktreeInputDropdown = forwardRef(function WorktreeInputDropdown(
  { anchorRef, s, onClose, initialValue, active, baseBranch, onConfirm, onDisable },
  ref
) {
  const t = useTranslator();
  const [pos, setPos] = useState(null);
  const [value, setValue] = useState(initialValue || "");

  const updatePosition = useCallback(() => {
    if (!anchorRef?.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setPos(getFloatingMenuLayout(rect, 300, 180));
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
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.nativeEvent.isComposing) {
          event.preventDefault(); event.stopPropagation(); onClose(); anchorRef.current?.querySelector("button")?.focus();
        }
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        zIndex: 500,
        width: pos.width,
        background: SHEET_BG,
        backdropFilter: "blur(48px) saturate(1.2)",
        border: "1px solid var(--pane-border)",
        borderRadius: 10,
        padding: 3,
        boxShadow: "var(--shadow-md)",
        animation: "dropIn .15s ease",
        WebkitAppRegion: "no-drag",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <input
        autoFocus
        type="text"
        placeholder={t("newChat.worktreeNamePlaceholder")}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) {
            e.preventDefault();
            onConfirm(value);
          }
        }}
        style={{
          background: SHEET_HOVER,
          border: "none",
          outline: "none",
          padding: "8px 10px",
          fontSize: s(11),
          fontFamily: "var(--font-mono)",
          color: "var(--text-primary)",
          borderBottom: "1px solid var(--pane-border)",
          borderRadius: "7px 7px 0 0",
        }}
      />

      {baseBranch && (
        <div style={{
          padding: "6px 10px 2px",
          fontSize: s(9),
          fontFamily: "var(--font-mono)",
          color: "var(--text-muted)",
          letterSpacing: ".04em",
        }}>
          {t("newChat.worktreeFrom", { value: baseBranch })}
        </div>
      )}

      <button
        onClick={() => onConfirm(value)}
        style={getNeutralDropdownItemStyle(s)}
        onMouseEnter={(e) => { e.currentTarget.style.background = SHEET_HOVER; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      >
        {value.trim() ? t("newChat.useNamedWorktree", { value: value.trim() }) : t("newChat.useRandomWorktree")}
      </button>

      {active && (
        <button
          onClick={onDisable}
          style={getNeutralDropdownItemStyle(s)}
          onMouseEnter={(e) => { e.currentTarget.style.background = SHEET_HOVER; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          {t("newChat.turnOffWorktree")}
        </button>
      )}
    </div>
  );
});
