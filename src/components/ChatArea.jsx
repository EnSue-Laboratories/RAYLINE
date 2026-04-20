import { useState, useRef, useCallback, useEffect } from "react";
import { flushSync } from "react-dom";
import { PanelLeftOpen, Plus, ArrowRight, ArrowDown, Square, Terminal as TerminalIcon } from "lucide-react";
import Message from "./Message";
import EmptyState from "./EmptyState";
import NewChatCard from "./NewChatCard";
import ModelPicker from "./ModelPicker";
import BranchSelector from "./BranchSelector";
import GitStatusPill from "./GitStatusPill";
import ImagePreview from "./ImagePreview";
import SelectionToolbar from "./SelectionToolbar";
import { useFontScale } from "../contexts/FontSizeContext";
import { WINDOW_DRAG_HEIGHT } from "../windowChrome";
import { getPaneSurfaceStyle } from "../utils/paneSurface";
import TabStrip from "./TabStrip";

export default function ChatArea({ convo, onSend, onCancel, onEdit, onToggleSidebar, sidebarOpen, onNew, onModelChange, defaultModel, queuedMessages, onToggleTerminal, terminalOpen, terminalCount, wallpaper, cwd, onCwdChange, onRefocusTerminal, showNewChatCard, onCreateChat, onCancelNewChat, allCwdRoots, projects, defaultPrBranch, newChatDefaultCwd, coauthorEnabled = false, coauthorTrailer = "", onControlChange, canControlTarget, developerMode = true, tabs = [], activeTabId = null, onSelectTab, onCloseTab }) {
  const s = useFontScale();
  const [input, setInput]             = useState("");
  const [inputFocused, setInputFocused] = useState(false);
  const [attachments, setAttachments]   = useState([]);
  const endRef  = useRef(null);
  const inRef   = useRef(null);
  const messageBodyRef = useRef(null);

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

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    // New message → force follow on and smooth-scroll to bottom
    if (msgCount !== prevMsgCount.current) {
      prevMsgCount.current = msgCount;
      followingRef.current = true;
      endRef.current?.scrollIntoView({ behavior: "smooth" });
      return;
    }

    // Streaming update → pin to bottom instantly so chunks can't outrun us
    if (followingRef.current) {
      endRef.current?.scrollIntoView({ behavior: "auto" });
    }
  }, [msgCount, convo?.isStreaming, lastPartText]);

  // Track whether the user is near the bottom to toggle the scroll-to-bottom
  // button, and maintain follow-mode based on user scroll direction.
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let lastScrollTop = el.scrollTop;
    const handleScroll = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      // scrollTop dropping means the user (or momentum) scrolled up
      if (el.scrollTop < lastScrollTop - 2) {
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
    return () => el.removeEventListener("scroll", handleScroll);
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
    onSend(nextInput, nextAttachments);
  }, [attachments, canSend, onSend, shellMode, trimmedInput]);

  const handleInput = (e) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "20px";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  };

  const handleKeyDown = (e) => {
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
    const files = e.dataTransfer?.files;
    if (!files) return;
    for (const file of files) {
      // Get file path via Electron's webUtils (works with context isolation)
      const filePath = window.api?.getFilePath?.(file) || file.path || null;

      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          setAttachments((prev) => [...prev, { type: "image", dataUrl: ev.target.result, name: file.name, path: filePath }]);
        };
        reader.readAsDataURL(file);
      } else {
        // Any file (PDF, code, docs, etc.) — pass the path to the agent
        setAttachments((prev) => [...prev, { type: "file", name: file.name, path: filePath || file.name }]);
      }
    }
  };

  const [dragOver, setDragOver] = useState(false);
  const showHeaderTabs = tabs.length > 0 && !showNewChatCard;
  const showConversationTitle = Boolean(convo && !showNewChatCard);
  const topTabsLeft = sidebarOpen ? 18 : 104;

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setDragOver(false);
  };

  // Prevent Electron from navigating to dropped files (on window, not our drop zone)
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

  // Selection toolbar handlers
  const handleQuote = useCallback((text) => {
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
  }, []);


  return (
    <div
      style={{
        flex: 1, display: "flex", flexDirection: "column", minWidth: 0, position: "relative", zIndex: 10,
        ...getPaneSurfaceStyle(Boolean(wallpaper?.dataUrl)),
        boxShadow: dragOver ? "inset 0 0 0 1px rgba(153,214,255,0.18)" : "none",
        transition: "box-shadow .2s ease",
      }}
      onDrop={(e) => { e.stopPropagation(); handleDrop(e); setDragOver(false); }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {/* Drag region matching sidebar spacer */}
      <div style={{ height: WINDOW_DRAG_HEIGHT, WebkitAppRegion: "drag", flexShrink: 0 }} />

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
            <TabStrip
              tabs={tabs}
              activeId={activeTabId}
              onSelect={onSelectTab}
              onClose={onCloseTab}
            />
          </div>
        </div>
      )}

      {/* Sidebar collapsed: icon buttons below traffic lights */}
      {!sidebarOpen && (
        <div style={{
          position: "fixed", top: WINDOW_DRAG_HEIGHT, left: 34,
          display: "flex", gap: 4,
          zIndex: 50, WebkitAppRegion: "no-drag",
        }}>
          <button
            onClick={onToggleSidebar}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 28, height: 28, borderRadius: 7,
              background: "none", border: "none", cursor: "pointer",
              color: "rgba(255,255,255,0.4)", transition: "all .15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.75)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.4)"; }}
          >
            <PanelLeftOpen size={16} strokeWidth={1.5} />
          </button>
          <button
            onClick={onNew}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 28, height: 28, borderRadius: 7,
              background: "none", border: "none", cursor: "pointer",
              color: "rgba(255,255,255,0.4)", transition: "all .15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.75)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.4)"; }}
          >
            <Plus size={16} strokeWidth={1.5} />
          </button>
        </div>
      )}

      {/* Top bar — aligns with sidebar header */}
      <div
        style={{
          padding: "0 24px 12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
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
                color: "rgba(255,255,255,0.88)",
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
                  color: "rgba(255,255,255,0.28)",
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
            <GitStatusPill
              cwd={cwd}
              defaultPrBranch={defaultPrBranch}
              coauthorEnabled={coauthorEnabled}
              coauthorTrailer={coauthorTrailer}
            />
          )}
          {!showNewChatCard && developerMode && (
            <BranchSelector
              cwd={cwd}
              onCwdChange={onCwdChange}
              hasMessages={convo?.msgs?.length > 0}
              onRefocusTerminal={onRefocusTerminal}
            />
          )}
          {!showNewChatCard && <ModelPicker value={convo?.model || defaultModel || "sonnet"} onChange={onModelChange} />}
          {!showNewChatCard && developerMode && onToggleTerminal && (
            <button
              onClick={onToggleTerminal}
              title="Toggle terminal"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                width: terminalCount > 0 ? "auto" : 26,
                height: 23,
                padding: terminalCount > 0 ? "0 8px" : 0,
                borderRadius: 7,
                background: terminalOpen ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.04)",
                border: "1px solid " + (terminalOpen ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)"),
                color: terminalOpen ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.4)",
                cursor: "pointer",
                transition: "all .2s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = "rgba(255,255,255,0.7)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = terminalOpen ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.04)"; e.currentTarget.style.color = terminalOpen ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.4)"; }}
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
        {showNewChatCard ? (
          <NewChatCard
            defaultCwd={newChatDefaultCwd}
            defaultModel={convo?.model || defaultModel}
            defaultBranch={defaultPrBranch}
            allCwdRoots={allCwdRoots}
            projects={projects}
            onPickFolder={() => window.api?.pickFolder?.()}
            onCreateChat={onCreateChat}
            onCancel={onCancelNewChat}
            developerMode={developerMode}
          />
        ) : !convo || convo.msgs.length === 0 ? (
          <EmptyState model={convo?.model || "sonnet"} />
        ) : (
          <div ref={messageBodyRef} style={{ maxWidth: 640, width: "100%", margin: "0 auto", flex: 1 }}>
            {convo.msgs.map((m, i) => (
              <Message
                key={m.id}
                msg={m}
                modelId={convo?.model || defaultModel}
                onEdit={m.role === "user" && m.mode !== "shell-command" ? (newText) => onEdit(i, newText) : undefined}
                onAnswer={m.role === "assistant" ? (text) => onSend(text) : undefined}
                onControlChange={m.role === "assistant" ? onControlChange : undefined}
                canControlTarget={m.role === "assistant" ? canControlTarget : undefined}
                wallpaper={wallpaper}
              />
            ))}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {!showNewChatCard && convo?.msgs?.length > 0 && (
        <SelectionToolbar
          onQuote={handleQuote}
          model={convo?.model || defaultModel || "sonnet"}
          selectionRootRef={messageBodyRef}
        />
      )}

      {/* Scroll to bottom button */}
      {!showNewChatCard && convo && convo.msgs.length > 0 && (
        <button
          onClick={scrollToBottom}
          aria-label="Scroll to bottom"
          title="Scroll to bottom"
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
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.04)",
            color: "rgba(255,255,255,0.72)",
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
            e.currentTarget.style.background = "rgba(255,255,255,0.06)";
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.10)";
            e.currentTarget.style.color = "rgba(255,255,255,0.92)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.02)";
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.04)";
            e.currentTarget.style.color = "rgba(255,255,255,0.72)";
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
              {queuedMessages.map((q, i) => (
                <div key={i} style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "5px 10px",
                  marginBottom: 4,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.05)",
                  borderRadius: 8,
                  fontSize: s(12),
                  color: "rgba(255,255,255,0.35)",
                  fontFamily: "system-ui,sans-serif",
                }}>
                  <span style={{
                    fontSize: s(9),
                    fontFamily: "'JetBrains Mono',monospace",
                    color: "rgba(255,255,255,0.2)",
                    letterSpacing: ".06em",
                    flexShrink: 0,
                  }}>QUEUED</span>
                  <span style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}>{q.text}</span>
                </div>
              ))}
            </div>
          )}
          {/* Slash command palette */}
          {filteredCommands.length > 0 && (
            <div style={{
              marginBottom: 6,
              background: wallpaper?.dataUrl ? "var(--pane-elevated)" : "rgba(24,24,24,0.95)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 10,
              padding: "4px",
              backdropFilter: "blur(20px)",
              boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
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
                    background: i === selectedCmd ? "rgba(255,255,255,0.06)" : "transparent",
                    transition: "background .1s",
                  }}
                  onMouseEnter={() => setSelectedCmd(i)}
                >
                  <span style={{
                    fontSize: s(12),
                    fontFamily: "'JetBrains Mono',monospace",
                    color: "rgba(255,255,255,0.7)",
                  }}>{c.cmd}</span>
                  <span style={{
                    fontSize: s(11),
                    color: "rgba(255,255,255,0.25)",
                    fontFamily: "system-ui,sans-serif",
                  }}>{c.desc}</span>
                </div>
              ))}
            </div>
          )}
          <ImagePreview items={attachments} onRemove={removeAttachment} />
          {shellMode && (
            <div
              style={{
                marginBottom: 6,
                fontSize: s(10),
                fontFamily: "'JetBrains Mono',monospace",
                letterSpacing: ".1em",
                color: "rgba(255,255,255,0.35)",
              }}
            >
              {canRunShell
                ? `SHELL MODE  //  RUNS IN ${shellLocation.toUpperCase()}`
                : "SHELL MODE  //  TYPE A COMMAND AFTER !"}
            </div>
          )}

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: inputFocused ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.02)",
              border: (shellMode ? "2px solid " : "1px solid ") + (inputFocused ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.10)"),
              borderRadius: 12,
              padding: shellMode ? "8px 13px" : "9px 14px",
              backdropFilter: "blur(20px)",
              transition: "border-color .25s, background .25s",
            }}
          >
            <textarea
              ref={inRef}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              placeholder={shellMode ? "Run a shell command locally..." : "Ask anything..."}
              rows={1}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                resize: "none",
                color: "rgba(255,255,255,0.92)",
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
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  color: "rgba(255,255,255,0.5)",
                  cursor: "pointer",
                  transition: "all .2s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.12)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
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
