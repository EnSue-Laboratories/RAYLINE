import { memo, useState, useRef, useCallback, useEffect, useMemo } from "react";
import { flushSync } from "react-dom";
import { ArrowRight, ArrowDown, Square, Terminal as TerminalIcon } from "lucide-react";
import Message from "./Message";
import EmptyState from "./EmptyState";
import NewChatCard from "./NewChatCard";
import { ModelPickerWithMultica } from "../data/multicaModels.jsx";
import BranchSelector from "./BranchSelector";
import GitStatusPill from "./GitStatusPill";
import ImagePreview from "./ImagePreview";
import SelectionToolbar from "./SelectionToolbar";
import ExportConversationBtn from "./ExportConversationBtn";
import { useFontScale } from "../contexts/FontSizeContext";
import { WINDOW_DRAG_HEIGHT } from "../windowChrome";
import { getPaneSurfaceStyle } from "../utils/paneSurface";
import { clipboardItemsToAttachments, dataTransferHasFiles, fileListToAttachments } from "../utils/attachments";
import TabStrip from "./TabStrip";
import useGitStatus from "../hooks/useGitStatus";
import { isMulticaModelId } from "../data/models";
import { createTranslator } from "../i18n";

const EMPTY_MESSAGES = [];
const MemoBranchSelector = memo(BranchSelector);
const MemoExportConversationBtn = memo(ExportConversationBtn);
const MemoGitStatusPill = memo(GitStatusPill);
const MemoImagePreview = memo(ImagePreview);
const MemoModelPickerWithMultica = memo(ModelPickerWithMultica);
const MemoSelectionToolbar = memo(SelectionToolbar);
const MemoTabStrip = memo(TabStrip);

const ChatTranscript = memo(function ChatTranscript({
  showNewChatCard,
  convo,
  defaultModel,
  defaultPrBranch,
  newChatDefaultCwd,
  allCwdRoots,
  projects,
  onPickFolder,
  onCreateChat,
  onCancelNewChat,
  developerMode,
  locale = "en-US",
  onEdit,
  onAnswer,
  onControlChange,
  canControlTarget,
  wallpaper,
  messageBodyRef,
  endRef,
}) {
  const messages = convo?.msgs || EMPTY_MESSAGES;

  if (showNewChatCard) {
    return (
      <NewChatCard
        defaultCwd={newChatDefaultCwd}
        defaultModel={convo?.model || defaultModel}
        defaultBranch={defaultPrBranch}
        allCwdRoots={allCwdRoots}
        projects={projects}
        onPickFolder={onPickFolder}
        onCreateChat={onCreateChat}
        onCancel={onCancelNewChat}
        developerMode={developerMode}
        locale={locale}
      />
    );
  }

  if (!convo || messages.length === 0) {
    return <EmptyState model={convo?.model || "sonnet"} />;
  }

  return (
    <div ref={messageBodyRef} style={{ maxWidth: 640, width: "100%", margin: "0 auto", flex: 1 }}>
      {messages.map((msg, index) => (
        <Message
          key={msg.id}
          msg={msg}
          messageIndex={index}
          modelId={convo?.model || defaultModel}
          canEdit={msg.role === "user" && msg.mode !== "shell-command"}
          onEdit={onEdit}
          onAnswer={onAnswer}
          onControlChange={onControlChange}
          canControlTarget={canControlTarget}
          wallpaper={wallpaper}
        />
      ))}
      <div ref={endRef} />
    </div>
  );
});

export default function ChatArea({ convo, onSend, onCancel, onEdit, sidebarOpen, onModelChange, defaultModel, queuedMessages, onUpdateQueuedMessage, onRemoveQueuedMessage, onToggleTerminal, terminalOpen, terminalCount, wallpaper, cwd, onCwdChange, onRefocusTerminal, showNewChatCard, onCreateChat, onCancelNewChat, allCwdRoots, projects, defaultPrBranch, newChatDefaultCwd, coauthorEnabled = false, coauthorTrailer = "", onControlChange, canControlTarget, developerMode = true, tabs = [], activeTabId = null, onSelectTab, onCloseTab, locale = "en-US", composerDraft = null, onComposerDraftChange, chromeRailInset = 0 }) {
  const s = useFontScale();
  const t = createTranslator(locale);
  const [inputFocused, setInputFocused] = useState(false);
  const [editingQueueId, setEditingQueueId] = useState(null);
  const [queueDraft, setQueueDraft] = useState("");
  const endRef  = useRef(null);
  const inRef   = useRef(null);
  const queueEditRef = useRef(null);
  const dragDepthRef = useRef(0);
  const composingRef = useRef(false);
  // Callback ref so the ResizeObserver re-attaches when the message body
  // re-mounts (e.g. showNewChatCard toggling). Keep the ref object too so
  // SelectionToolbar can still read .current.
  const messageBodyRef = useRef(null);
  const [messageBodyEl, setMessageBodyEl] = useState(null);
  const setMessageBodyNode = useCallback((node) => {
    messageBodyRef.current = node;
    setMessageBodyEl(node);
  }, []);
  const draft = useMemo(
    () => ({
      text: typeof composerDraft?.text === "string" ? composerDraft.text : "",
      attachments: Array.isArray(composerDraft?.attachments) ? composerDraft.attachments : [],
    }),
    [composerDraft]
  );
  const input = draft.text;
  const attachments = draft.attachments;
  const setInput = useCallback((nextValue) => {
    if (!onComposerDraftChange) return;
    onComposerDraftChange((prev) => ({
      ...prev,
      text: typeof nextValue === "function" ? nextValue(prev.text || "") : nextValue,
    }));
  }, [onComposerDraftChange]);
  const setAttachments = useCallback((nextValue) => {
    if (!onComposerDraftChange) return;
    onComposerDraftChange((prev) => ({
      ...prev,
      attachments: typeof nextValue === "function"
        ? nextValue(Array.isArray(prev.attachments) ? prev.attachments : [])
        : nextValue,
    }));
  }, [onComposerDraftChange]);

  // Scroll to bottom on new messages and during streaming
  const scrollRef = useRef(null);
  const msgCount = convo?.msgs?.length || 0;
  const lastMsg = convo?.msgs?.[msgCount - 1];
  const lastParts = lastMsg?.parts;
  const lastPartText = lastParts?.[lastParts.length - 1]?.text || lastMsg?.text;
  const prevMsgCount = useRef(0);
  // Sticky follow-mode: true until the user actively scrolls up, flips back
  // on when they return to the bottom. Ref (not state) so rapid streaming
  // updates don't trigger re-renders and stay in sync with scroll events.
  const followingRef = useRef(true);

  // Reset follow state on conversation switch so chat B doesn't inherit
  // chat A's "user scrolled up" state.
  useEffect(() => {
    followingRef.current = true;
    prevMsgCount.current = 0;
  }, [convo?.id]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    // New message (count INCREASED) → force follow on and smooth-scroll to bottom
    if (msgCount > prevMsgCount.current) {
      prevMsgCount.current = msgCount;
      followingRef.current = true;
      endRef.current?.scrollIntoView({ behavior: "smooth" });
      return;
    }

    // Count decreased (edit rewind, /clear, /compact) → track the new count
    // but don't hijack the user's scroll position.
    if (msgCount < prevMsgCount.current) {
      prevMsgCount.current = msgCount;
      return;
    }

    // Streaming update → pin to bottom instantly so chunks can't outrun us
    if (followingRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [msgCount, convo?.isStreaming, lastPartText]);

  // Pin to bottom whenever content height changes while following. Catches
  // renders that don't trigger the text-diff effect above — LoadingStatus
  // growing an extra line when usage arrives, thinking blocks expanding,
  // mermaid/katex rendering in late, etc.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !messageBodyEl || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (followingRef.current) {
        el.scrollTop = el.scrollHeight;
      }
    });
    ro.observe(messageBodyEl);
    return () => ro.disconnect();
  }, [messageBodyEl]);

  // Track whether the user is near the bottom to toggle the scroll-to-bottom
  // button, and maintain follow-mode based on user scroll direction.
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let lastScrollTop = el.scrollTop;
    // Gate "user scrolled up" detection behind recent real user input.
    // Otherwise content shrink (thinking block collapses, images clamping
    // scrollTop) and trackpad momentum bounce silently kill follow-mode.
    let userIntentUntil = 0;
    const markIntent = () => { userIntentUntil = Date.now() + 500; };

    const handleScroll = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      // Require both a meaningful delta and recent user input to disable follow.
      if (el.scrollTop < lastScrollTop - 8 && Date.now() < userIntentUntil) {
        followingRef.current = false;
      }
      // Reached the bottom again → resume following
      if (distanceFromBottom < 40) {
        followingRef.current = true;
      }
      lastScrollTop = el.scrollTop;
      setShowScrollToBottom(distanceFromBottom > 120);
    };
    handleScroll();
    el.addEventListener("scroll", handleScroll, { passive: true });
    el.addEventListener("wheel", markIntent, { passive: true });
    el.addEventListener("touchstart", markIntent, { passive: true });
    el.addEventListener("pointerdown", markIntent, { passive: true });
    el.addEventListener("keydown", markIntent);
    return () => {
      el.removeEventListener("scroll", handleScroll);
      el.removeEventListener("wheel", markIntent);
      el.removeEventListener("touchstart", markIntent);
      el.removeEventListener("pointerdown", markIntent);
      el.removeEventListener("keydown", markIntent);
    };
  }, [convo?.id, msgCount]);

  const scrollToBottom = useCallback(() => {
    followingRef.current = true;
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const isStreaming = convo?.isStreaming;

  // Slash command suggestions
  const COMMANDS = [
    { cmd: "/clear", desc: "Start a new conversation" },
    { cmd: "/new", desc: "Start a new conversation" },
    { cmd: "/compact", desc: "Compact conversation context" },
  ];
  const showCommands = input.startsWith("/") && !input.includes(" ");
  const filteredCommands = showCommands
    ? COMMANDS.filter(c => c.cmd.startsWith(input.toLowerCase()))
    : [];
  const [selectedCmd, setSelectedCmd] = useState(0);
  const trimmedInput = input.trim();
  const shellMode = trimmedInput.startsWith("!");
  const canRunShell = shellMode && trimmedInput.length > 1;
  const canSend = shellMode ? canRunShell : Boolean(trimmedInput) || attachments.length > 0;
  const shellLocation = cwd ? (() => {
    const parts = cwd.split("/");
    const wtIdx = parts.indexOf(".worktrees");
    if (wtIdx >= 0 && wtIdx + 1 < parts.length) {
      return `${parts[wtIdx - 1]} / ${parts[wtIdx + 1]}`;
    }
    return parts.slice(-2).join("/") || parts[parts.length - 1] || cwd;
  })() : "current workspace";

  const activeModelId = convo?.model || defaultModel;
  const isMulticaModel = isMulticaModelId(activeModelId);
  const { status: gitStatus } = useGitStatus(cwd);
  const hasDirtyWorktree = (gitStatus?.files?.length || 0) > 0;
  const hasNoUpstream = Boolean(gitStatus?.branch) && !gitStatus?.upstream && !gitStatus?.detached;
  const branchNeedsAttention = hasDirtyWorktree || hasNoUpstream;
  const activeConvoId = convo?.id || "";
  const [branchHintDismissedFor, setBranchHintDismissedFor] = useState("");
  const branchHintDismissed = activeConvoId !== "" && branchHintDismissedFor === activeConvoId;
  const showBranchHint = isMulticaModel && !showNewChatCard && branchNeedsAttention && !branchHintDismissed && !shellMode;
  const branchHintText = (() => {
    if (hasDirtyWorktree && hasNoUpstream) return "BRANCH MAY NEED UPDATING  //  UNCOMMITTED CHANGES + NOT PUBLISHED";
    if (hasDirtyWorktree) return "BRANCH MAY NEED UPDATING  //  UNCOMMITTED CHANGES";
    return "BRANCH MAY NEED UPDATING  //  NOT PUBLISHED TO ORIGIN";
  })();

  const send = useCallback(() => {
    if (!canSend) return;
    const nextInput = trimmedInput;
    const nextAttachments = shellMode ? undefined : (attachments.length > 0 ? attachments : undefined);
    flushSync(() => {
      setInput("");
      setAttachments([]);
      setSelectedCmd(0);
    });
    if (inRef.current) inRef.current.style.height = "20px";
    if (isMulticaModel && !shellMode && activeConvoId) setBranchHintDismissedFor(activeConvoId);
    onSend(nextInput, nextAttachments);
  }, [activeConvoId, attachments, canSend, isMulticaModel, onSend, setAttachments, setInput, shellMode, trimmedInput]);

  const handleInput = (e) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "20px";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  };

  const handleKeyDown = (e) => {
    const isComposing =
      composingRef.current
      || e.nativeEvent?.isComposing
      || e.isComposing
      || e.keyCode === 229;
    if (isComposing) return;

    // Command palette navigation
    if (filteredCommands.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedCmd((p) => Math.min(p + 1, filteredCommands.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedCmd((p) => Math.max(p - 1, 0));
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        setInput(filteredCommands[selectedCmd].cmd + " ");
        setSelectedCmd(0);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setInput("");
        setSelectedCmd(0);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const handlePaste = (e) => {
    const items = Array.from(e.clipboardData?.items || []);
    if (!items.some((item) => item?.kind === "file")) return;

    e.preventDefault();
    void clipboardItemsToAttachments(items).then((nextAttachments) => {
      if (nextAttachments.length === 0) return;
      setAttachments((prev) => [...prev, ...nextAttachments]);
    });
  };

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
  }, [resetDragState, setAttachments]);

  const showHeaderTabs = tabs.length > 0 && !showNewChatCard;
  const showConversationTitle = Boolean(convo && !showNewChatCard);
  const collapsedRailInset = sidebarOpen ? 0 : chromeRailInset;
  const topTabsLeft = sidebarOpen ? 18 : Math.max(104, collapsedRailInset);
  const headerContentOffset = showHeaderTabs ? 8 : 0;

  useEffect(() => {
    if (!inRef.current) return;
    inRef.current.style.height = "20px";
    inRef.current.style.height = `${Math.min(inRef.current.scrollHeight, 120)}px`;
  }, [input]);

  const handleDragEnter = (e) => {
    if (!dataTransferHasFiles(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current += 1;
    setDragOver(true);
  };

  const handleDragOver = useCallback((e) => {
    if (!dataTransferHasFiles(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
    if (!dragOver) setDragOver(true);
  }, [dragOver]);

  const handleDragLeave = (e) => {
    if (!dataTransferHasFiles(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragOver(false);
  };

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

  useEffect(() => {
    const preventNav = (e) => { e.preventDefault(); };
    window.addEventListener("dragover", preventNav);
    window.addEventListener("drop", preventNav);
    return () => {
      window.removeEventListener("dragover", preventNav);
      window.removeEventListener("drop", preventNav);
    };
  }, []);

  const removeAttachment = (index) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleTranscriptAnswer = useCallback((text) => {
    onSend(text);
  }, [onSend]);

  const handlePickFolder = useCallback(() => window.api?.pickFolder?.(), []);

  const startQueuedEdit = useCallback((item) => {
    if (!item?.id) return;
    setEditingQueueId(item.id);
    setQueueDraft(item.text || "");
  }, []);

  const cancelQueuedEdit = useCallback(() => {
    setEditingQueueId(null);
    setQueueDraft("");
  }, []);

  const saveQueuedEdit = useCallback((queueId) => {
    const trimmed = queueDraft.trim();
    if (!trimmed) {
      onRemoveQueuedMessage?.(queueId);
    } else {
      onUpdateQueuedMessage?.(queueId, trimmed);
    }
    setEditingQueueId(null);
    setQueueDraft("");
  }, [onRemoveQueuedMessage, onUpdateQueuedMessage, queueDraft]);

  const removeQueuedItem = useCallback((queueId) => {
    if (editingQueueId === queueId) {
      setEditingQueueId(null);
      setQueueDraft("");
    }
    onRemoveQueuedMessage?.(queueId);
  }, [editingQueueId, onRemoveQueuedMessage]);

  const handleQueuedDraftKeyDown = useCallback((event, queueId) => {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelQueuedEdit();
      return;
    }

    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      saveQueuedEdit(queueId);
    }
  }, [cancelQueuedEdit, saveQueuedEdit]);

  useEffect(() => {
    if (editingQueueId === null) return;
    queueEditRef.current?.focus();
  }, [editingQueueId]);

  useEffect(() => {
    const el = queueEditRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 24), 52)}px`;
  }, [editingQueueId, queueDraft]);

  // Selection toolbar handlers
  const handleQuote = (text) => {
    const quoted = text.split("\n").map(l => `> ${l}`).join("\n");
    setInput((prev) => prev ? `${prev}\n\n${quoted}\n\n` : `${quoted}\n\n`);
    // Expand textarea to fit
    setTimeout(() => {
      if (inRef.current) {
        inRef.current.style.height = "20px";
        inRef.current.style.height = Math.min(inRef.current.scrollHeight, 120) + "px";
        inRef.current.focus();
      }
    }, 0);
  };


  return (
    <div
      style={{
        flex: 1, display: "flex", flexDirection: "column", minWidth: 0, position: "relative", zIndex: 10,
        ...getPaneSurfaceStyle(Boolean(wallpaper?.dataUrl)),
      }}
      onDrop={(e) => { e.stopPropagation(); handleDrop(e); setDragOver(false); }}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {/* Drag region matching sidebar spacer */}
      <div
        style={{
          height: WINDOW_DRAG_HEIGHT,
          WebkitAppRegion: "drag",
          flexShrink: 0,
        }}
      />

      {showHeaderTabs && (
        <div
          style={{
            position: "absolute",
            top: 10,
            left: topTabsLeft,
            right: 24,
            zIndex: 40,
            display: "flex",
            alignItems: "center",
            minWidth: 0,
            pointerEvents: "none",
            WebkitAppRegion: "no-drag",
          }}
        >
          <div
            style={{
              flex: 1,
              minWidth: 0,
              pointerEvents: "auto",
            }}
          >
            <MemoTabStrip
              tabs={tabs}
              activeId={activeTabId}
              onSelect={onSelectTab}
              onClose={onCloseTab}
            />
          </div>
        </div>
      )}

      {/* Top bar — aligns with sidebar header */}
      <div
        style={{
          padding: `${headerContentOffset}px 24px 12px ${24 + collapsedRailInset}px`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "padding-top .16s ease",
        }}
      >
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          maxWidth: !sidebarOpen ? 640 : "none",
        }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            WebkitAppRegion: "no-drag",
            minWidth: 0,
            flex: 1,
          }}
        >
          {showConversationTitle && (
            <div style={{ animation: "dropIn .2s ease", minWidth: 0 }}>
              <div style={{
                fontSize: s(12.5),
                color: "var(--text-primary)",
                fontFamily: "system-ui,sans-serif",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: 360,
                letterSpacing: "0.01em",
              }}>
                {convo.title}
              </div>
              <div
                style={{
                  fontSize: s(9),
                  fontFamily: "'JetBrains Mono',monospace",
                  color: "var(--text-faint)",
                  marginTop: 2,
                  letterSpacing: ".1em",
                }}
              >
                {convo.msgs.length} MESSAGES
              </div>
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, WebkitAppRegion: "no-drag" }}>
          {!showNewChatCard && developerMode && (
            <MemoGitStatusPill
              cwd={cwd}
              defaultPrBranch={defaultPrBranch}
              coauthorEnabled={coauthorEnabled}
              coauthorTrailer={coauthorTrailer}
            />
          )}
          {!showNewChatCard && developerMode && (
            <MemoBranchSelector
              cwd={cwd}
              onCwdChange={onCwdChange}
              hasMessages={convo?.msgs?.length > 0}
              onRefocusTerminal={onRefocusTerminal}
            />
          )}
          {!showNewChatCard && <MemoModelPickerWithMultica value={convo?.model || defaultModel || "sonnet"} onChange={onModelChange} />}
          {!showNewChatCard && convo?.msgs?.length > 0 && (
            <MemoExportConversationBtn convo={convo} />
          )}
          {!showNewChatCard && developerMode && onToggleTerminal && (
            <button
              onClick={onToggleTerminal}
              title={t("chatArea.toggleTerminal")}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                width: terminalCount > 0 ? "auto" : 26,
                height: 23,
                padding: terminalCount > 0 ? "0 8px" : 0,
                borderRadius: 7,
                background: terminalOpen ? "var(--control-bg-hover)" : "var(--control-bg)",
                border: "1px solid " + (terminalOpen ? "var(--control-border-strong)" : "var(--control-border)"),
                color: terminalOpen ? "var(--text-secondary)" : "var(--text-muted)",
                cursor: "pointer",
                transition: "all .2s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--control-bg-hover)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = terminalOpen ? "var(--control-bg-hover)" : "var(--control-bg)"; e.currentTarget.style.color = terminalOpen ? "var(--text-secondary)" : "var(--text-muted)"; }}
            >
              <TerminalIcon size={14} strokeWidth={1.5} />
              {terminalCount > 0 && (
                <span style={{
                  fontSize: s(10),
                  fontFamily: "'JetBrains Mono',monospace",
                  color: "inherit",
                }}>
                  {terminalCount}
                </span>
              )}
            </button>
          )}
        </div>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "32px 28px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <ChatTranscript
          showNewChatCard={showNewChatCard}
          convo={convo}
          defaultModel={defaultModel}
          defaultPrBranch={defaultPrBranch}
          newChatDefaultCwd={newChatDefaultCwd}
          allCwdRoots={allCwdRoots}
          projects={projects}
          onPickFolder={handlePickFolder}
          onCreateChat={onCreateChat}
          onCancelNewChat={onCancelNewChat}
          developerMode={developerMode}
          locale={locale}
          onEdit={onEdit}
          onAnswer={handleTranscriptAnswer}
          onControlChange={onControlChange}
          canControlTarget={canControlTarget}
          wallpaper={wallpaper}
          messageBodyRef={setMessageBodyNode}
          endRef={endRef}
        />
      </div>

      {!showNewChatCard && convo?.msgs?.length > 0 && (
        <MemoSelectionToolbar
          onQuote={handleQuote}
          model={convo?.model || defaultModel || "sonnet"}
          selectionRootRef={messageBodyRef}
        />
      )}

      {/* Scroll to bottom button */}
      {!showNewChatCard && convo && convo.msgs.length > 0 && (
        <button
          onClick={scrollToBottom}
          aria-label={t("chatArea.scrollToBottom")}
          title={t("chatArea.scrollToBottom")}
          style={{
            position: "absolute",
            bottom: 108,
            left: "50%",
            transform: `translateX(-50%) scale(${showScrollToBottom ? 1 : 0.8})`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: "var(--control-bg-soft)",
            border: "1px solid var(--control-border-soft)",
            color: "var(--text-secondary)",
            cursor: "pointer",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
            opacity: showScrollToBottom ? 1 : 0,
            pointerEvents: showScrollToBottom ? "auto" : "none",
            transition: "opacity .2s ease, transform .2s cubic-bezier(.16,1,.3,1), background .2s ease, border-color .2s ease",
            zIndex: 20,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--control-bg)";
            e.currentTarget.style.borderColor = "var(--control-border-strong)";
            e.currentTarget.style.color = "var(--text-primary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "var(--control-bg-soft)";
            e.currentTarget.style.borderColor = "var(--control-border-soft)";
            e.currentTarget.style.color = "var(--text-secondary)";
          }}
        >
          <ArrowDown size={16} strokeWidth={1.75} />
        </button>
      )}

      {/* Input bar */}
      {!showNewChatCard &&
      <div
        style={{ padding: "12px 28px 24px", display: "flex", justifyContent: "center" }}
      >
        <div style={{ width: "100%", maxWidth: 560 }}>
          {queuedMessages && queuedMessages.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              {queuedMessages.map((q, i) => {
                const isEditingQueueItem = editingQueueId === q.id;
                const attachmentCount = Array.isArray(q.attachments) ? q.attachments.length : 0;
                const queueActionButtonStyle = {
                  height: 24,
                  padding: "0 9px",
                  borderRadius: 7,
                  border: "1px solid var(--control-border-soft)",
                  background: "transparent",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  fontSize: s(9),
                  fontFamily: "'JetBrains Mono',monospace",
                  letterSpacing: ".05em",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                };
                return (
                  <div
                    key={q.id || i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 8px",
                      marginBottom: 4,
                      background: "var(--control-bg-soft)",
                      border: "1px solid var(--control-border-soft)",
                      borderRadius: 12,
                      fontSize: s(12),
                      color: "var(--text-tertiary)",
                      fontFamily: "system-ui,sans-serif",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                        <span style={{
                          fontSize: s(9),
                          fontFamily: "'JetBrains Mono',monospace",
                          color: "var(--text-faint)",
                          letterSpacing: ".06em",
                          flexShrink: 0,
                        }}>
                          {i === 0 ? t("chatArea.queuedNext") : t("chatArea.queued")}
                        </span>
                        {attachmentCount > 0 && (
                          <span style={{
                            fontSize: s(9),
                            fontFamily: "'JetBrains Mono',monospace",
                            color: "var(--text-faint)",
                            letterSpacing: ".06em",
                          }}>
                            {t("chatArea.attachmentsCount", { value: attachmentCount, suffix: attachmentCount === 1 ? "" : "S" })}
                          </span>
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {isEditingQueueItem ? (
                          <textarea
                            ref={queueEditRef}
                            value={queueDraft}
                            onChange={(event) => setQueueDraft(event.target.value)}
                            onKeyDown={(event) => handleQueuedDraftKeyDown(event, q.id)}
                            rows={1}
                            style={{
                              width: "100%",
                              background: "var(--control-bg-soft)",
                              border: "1px solid var(--control-border)",
                              borderRadius: 7,
                              padding: "2px 8px",
                              color: "var(--text-primary)",
                              fontSize: s(12),
                              lineHeight: "18px",
                              fontFamily: "inherit",
                              resize: "none",
                              minHeight: 24,
                              maxHeight: 52,
                              overflowY: "auto",
                            }}
                          />
                        ) : (
                          <div style={{
                            minHeight: 24,
                            display: "flex",
                            alignItems: "center",
                            padding: "2px 8px",
                            transform: "translateY(-1.5px)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            lineHeight: "18px",
                            color: "var(--text-secondary)",
                          }}>
                            {q.text}
                          </div>
                        )}
                      </div>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        flexShrink: 0,
                      }}
                    >
                      {isEditingQueueItem ? (
                        <>
                          <button
                            onClick={() => saveQueuedEdit(q.id)}
                            style={{
                              ...queueActionButtonStyle,
                              background: "var(--control-bg)",
                              color: "var(--text-secondary)",
                            }}
                          >
                            {t("common.save")}
                          </button>
                          <button
                            onClick={cancelQueuedEdit}
                            style={queueActionButtonStyle}
                          >
                            {t("common.cancel")}
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => startQueuedEdit(q)}
                            style={queueActionButtonStyle}
                          >
                            {t("common.edit")}
                          </button>
                          <button
                            onClick={() => removeQueuedItem(q.id)}
                            style={queueActionButtonStyle}
                          >
                            {t("common.delete")}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {/* Slash command palette */}
          {filteredCommands.length > 0 && (
            <div style={{
              marginBottom: 6,
              background: wallpaper?.dataUrl ? "var(--pane-elevated)" : "var(--control-bg-strong)",
              border: "1px solid var(--control-border)",
              borderRadius: 10,
              padding: "4px",
              backdropFilter: "blur(20px)",
              boxShadow: "var(--control-shadow)",
            }}>
              {filteredCommands.map((c, i) => (
                <div
                  key={c.cmd}
                  onClick={() => { setInput(c.cmd); setSelectedCmd(0); }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "6px 10px",
                    borderRadius: 7,
                    cursor: "pointer",
                    background: i === selectedCmd ? "var(--control-bg)" : "transparent",
                    transition: "background .1s",
                  }}
                  onMouseEnter={() => setSelectedCmd(i)}
                >
                  <span style={{
                    fontSize: s(12),
                    fontFamily: "'JetBrains Mono',monospace",
                    color: "var(--text-secondary)",
                  }}>{c.cmd}</span>
                  <span style={{
                    fontSize: s(11),
                    color: "var(--text-faint)",
                    fontFamily: "system-ui,sans-serif",
                  }}>{c.desc}</span>
                </div>
              ))}
            </div>
          )}
          <MemoImagePreview items={attachments} onRemove={removeAttachment} />
          {shellMode && (
            <div
              style={{
                marginBottom: 6,
                fontSize: s(10),
                fontFamily: "'JetBrains Mono',monospace",
                letterSpacing: ".1em",
                color: "var(--text-muted)",
              }}
            >
              {canRunShell
                ? `SHELL MODE  //  RUNS IN ${shellLocation.toUpperCase()}`
                : "SHELL MODE  //  TYPE A COMMAND AFTER !"}
            </div>
          )}
          {showBranchHint && (
            <div
              style={{
                marginBottom: 6,
                fontSize: s(10),
                fontFamily: "'JetBrains Mono',monospace",
                letterSpacing: ".1em",
                color: "rgba(255,210,140,0.55)",
              }}
            >
              {branchHintText}
            </div>
          )}

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: dragOver
                ? "rgba(180,220,255,0.06)"
                : (inputFocused ? "var(--control-bg)" : "var(--control-bg-soft)"),
              border: (shellMode ? "2px solid " : "1px solid ") + (
                dragOver
                  ? "rgba(153,214,255,0.28)"
                  : (inputFocused ? "var(--control-border-strong)" : "var(--control-border)")
              ),
              borderRadius: 12,
              padding: shellMode ? "8px 13px" : "9px 14px",
              backdropFilter: "blur(20px)",
              boxShadow: dragOver ? "0 0 0 1px rgba(153,214,255,0.08)" : "none",
              transition: "border-color .25s, background .25s, box-shadow .25s",
            }}
          >
            <textarea
              ref={inRef}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              onCompositionStart={() => { composingRef.current = true; }}
              onCompositionEnd={() => { composingRef.current = false; }}
              onPaste={handlePaste}
              onFocus={() => setInputFocused(true)}
              onBlur={() => {
                composingRef.current = false;
                setInputFocused(false);
              }}
              placeholder={shellMode ? "Run a shell command locally..." : "Ask anything..."}
              rows={1}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                resize: "none",
                color: "var(--text-primary)",
                fontSize: s(13),
                lineHeight: 1.5,
                fontFamily: "system-ui,-apple-system,sans-serif",
                maxHeight: 120,
                height: "auto",
                display: "block",
                overflow: "auto",
              }}
            />
            {isStreaming && !input.trim() ? (
              <button
                onClick={onCancel}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  flexShrink: 0,
                  background: "var(--control-bg-strong)",
                  border: "1px solid var(--control-border-strong)",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  transition: "all .2s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--control-bg-hover)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "var(--control-bg-strong)"; }}
              >
                <Square size={10} fill="currentColor" />
              </button>
            ) : (
              <button
                onClick={send}
                disabled={!canSend}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: shellMode ? 6 : 0,
                  width: shellMode ? "auto" : 30,
                  height: 30,
                  padding: shellMode ? "0 12px" : 0,
                  borderRadius: 8,
                  flexShrink: 0,
                  background: canSend ? "rgba(255,255,255,0.82)" : "rgba(255,255,255,0.02)",
                  border: "none",
                  color: canSend ? "#000000" : "rgba(255,255,255,0.06)",
                  cursor: canSend ? "pointer" : "default",
                  transition: "all .3s cubic-bezier(.16,1,.3,1)",
                  transform: canSend ? "scale(1)" : "scale(0.88)",
                }}
              >
                {shellMode ? (
                  <>
                    <TerminalIcon size={14} strokeWidth={1.6} />
                    <span
                      style={{
                        fontSize: s(10),
                        fontFamily: "'JetBrains Mono',monospace",
                        letterSpacing: ".1em",
                      }}
                    >
                      RUN
                    </span>
                  </>
                ) : (
                  <ArrowRight size={16} strokeWidth={1.5} />
                )}
              </button>
            )}
          </div>

          <div
            style={{
              textAlign: "center",
              marginTop: 8,
              fontSize: s(8),
              fontFamily: "'JetBrains Mono',monospace",
              color: "rgba(255,255,255,0.30)",
              letterSpacing: ".1em",
            }}
          >
            {shellMode
              ? (canRunShell
                  ? "ENTER TO RUN  //  OUTPUT APPENDS BELOW  //  LOCAL SHELL"
                  : "TYPE A COMMAND AFTER !  //  ENTER TO RUN")
              : "ENTER TO SEND  //  SHIFT+ENTER NEWLINE  //  PASTE IMAGES"}
          </div>
        </div>
      </div>}
    </div>
  );
}
