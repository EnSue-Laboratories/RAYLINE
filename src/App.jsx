import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import AuroraCanvas from "./components/AuroraCanvas";
import Grain        from "./components/Grain";
import Sidebar      from "./components/Sidebar";
import ChatArea     from "./components/ChatArea";
import useAgent     from "./hooks/useAgent";
import useTerminal  from "./hooks/useTerminal";
import TerminalDrawer from "./components/TerminalDrawer";
import Settings     from "./components/Settings";
import { DEFAULT_MODEL_ID, getM, normalizeModelId } from "./data/models";
import { buildCrossProviderPrime, decoratePromptWithPrime } from "./utils/crossProviderPrime";
import { FontSizeContext } from "./contexts/FontSizeContext";

function logCheckpoint(...args) {
  console.log("[checkpoint-ui]", ...args);
}

function logSendFlow(...args) {
  console.log("[send-flow]", ...args);
}

function getMainRepoRoot(dir) {
  if (!dir) return dir;
  const wtIdx = dir.indexOf("/.worktrees/");
  return wtIdx !== -1 ? dir.slice(0, wtIdx) : dir;
}

function normalizeProjectsMeta(projectsMeta) {
  const normalized = {};
  const entries = Object.entries(projectsMeta || {}).sort(([a], [b]) => {
    const aIsRoot = a === getMainRepoRoot(a);
    const bIsRoot = b === getMainRepoRoot(b);
    return Number(aIsRoot) - Number(bIsRoot);
  });

  for (const [path, meta] of entries) {
    const root = getMainRepoRoot(path);
    if (!root) continue;
    const prev = normalized[root] || {};
    normalized[root] = {
      ...prev,
      ...meta,
      name: path === root ? (meta.name || root.split("/").pop()) : (prev.name || root.split("/").pop()),
      manual: Boolean(prev.manual || meta.manual),
    };
  }

  return normalized;
}

export default function App() {
  const {
    conversations,
    getConversation,
    prepareMessage,
    startPreparedMessage,
    cancelMessage,
    editAndResend,
    loadMessages,
  } = useAgent();
  const terminal = useTerminal();

  // convos: array of { id, sessionId, title, model, ts }
  const [convoList, setConvoList] = useState([]);
  const [active, setActive] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [defaultModel, setDefaultModel] = useState(DEFAULT_MODEL_ID);
  const [cwd, setCwd] = useState(null);
  const [stateLoaded, setStateLoaded] = useState(false);
  const [wallpaper, setWallpaper] = useState(null); // { path, opacity, blur }
  const [fontSize, setFontSize] = useState(15);
  const [showSettings, setShowSettings] = useState(false);
  const [projects, setProjects] = useState({});
  const [draftsCollapsed, setDraftsCollapsed] = useState(false);
  const [draftsPath, setDraftsPath] = useState(null);
  const [showNewChatCard, setShowNewChatCard] = useState(false);
  const messageQueue = useRef([]);
  const [queuedMessages, setQueuedMessages] = useState([]);

  // Load state from file on mount
  useEffect(() => {
    if (!window.api) { setStateLoaded(true); return; }
    window.api.loadState().then((state) => {
      if (state) {
        if (state.convos) {
          setConvoList(
            state.convos.map((convo) => ({
              ...convo,
              model: normalizeModelId(convo.model),
            }))
          );
        }
        if (state.active) setActive(state.active);
        if (state.cwd) setCwd(state.cwd);
        if (state.defaultModel) setDefaultModel(normalizeModelId(state.defaultModel));
        if (state.fontSize) setFontSize(state.fontSize);
        if (state.wallpaper) {
          setWallpaper(state.wallpaper);
          // Reload data URL from disk (not persisted — too large for JSON)
          if (state.wallpaper.path && window.api.readImage) {
            window.api.readImage(state.wallpaper.path).then((dataUrl) => {
              if (dataUrl) setWallpaper((prev) => prev ? { ...prev, dataUrl } : prev);
            });
          }
        }
        if (state.projects) setProjects(normalizeProjectsMeta(state.projects));
        if (state.draftsCollapsed != null) setDraftsCollapsed(state.draftsCollapsed);
      }
      setStateLoaded(true);
    });
    window.api.getDraftsPath?.().then((p) => { if (p) setDraftsPath(p); });
  }, []);

  // Persist state to file on changes (skip until initial load is done)
  const saveTimer = useRef(null);
  useEffect(() => {
    if (!stateLoaded || !window.api) return;
    // Debounce saves
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      // Strip dataUrl before persisting (too large for JSON, reloaded on startup)
      const wpSave = wallpaper ? { path: wallpaper.path, opacity: wallpaper.opacity, blur: wallpaper.blur, imgBlur: wallpaper.imgBlur, imgDarken: wallpaper.imgDarken } : null;
      window.api.saveState({ convos: convoList, active, cwd, defaultModel, fontSize, wallpaper: wpSave, projects, draftsCollapsed });
    }, 300);
  }, [convoList, active, cwd, defaultModel, fontSize, wallpaper, projects, draftsCollapsed, stateLoaded]);

  const activeConvo = convoList.find((c) => c.id === active);
  const activeData  = active ? getConversation(active) : { messages: [], isStreaming: false, error: null };

  // Load messages from Claude Code session files when selecting a conversation
  const handleSelect = useCallback(async (id) => {
    setShowNewChatCard(false);
    setActive(id);
    const convo = convoList.find((c) => c.id === id);
    const data = getConversation(id);
    if (convo && window.api) {
      try {
        const result = await window.api.loadSession(convo.sessionId);
        const msgs = result?.messages || result;
        const sessionCwd = result?.cwd || null;
        if (msgs && msgs.length > 0) {
          if (data.messages.length === 0) {
            // For forked conversations, only load messages up to the fork point
            loadMessages(id, msgs);
          }
          const lastMsg = msgs[msgs.length - 1];
          const previewText = lastMsg?.parts
            ? lastMsg.parts.filter(p => p.type === "text").map(p => p.text).join(" ")
            : (lastMsg?.text || "");
          setConvoList((p) =>
            p.map((c) => c.id === id ? {
              ...c,
              ...(previewText ? { lastPreview: previewText.slice(0, 60) } : {}),
              // Always trust session file location for CWD
              ...(sessionCwd ? { cwd: sessionCwd } : {}),
            } : c)
          );
        }
      } catch (e) {
        console.error("Failed to load session:", e);
      }
    }
  }, [convoList, getConversation, loadMessages]);

  // Load active conversation + previews after state is loaded
  useEffect(() => {
    if (!stateLoaded) return;
    if (active) handleSelect(active);
  }, [stateLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load previews for conversations missing them (runs after state load)
  useEffect(() => {
    if (!stateLoaded || !window.api) return;
    convoList.forEach(async (c) => {
      if (!c.lastPreview || c.lastPreview === "Empty" || !c.cwd) {
        try {
          const result = await window.api.loadSession(c.sessionId);
          const msgs = result?.messages || result;
          const sessionCwd = result?.cwd || null;
          if (msgs && msgs.length > 0) {
            const lastMsg = msgs[msgs.length - 1];
            const previewText = lastMsg?.parts
              ? lastMsg.parts.filter(p => p.type === "text").map(p => p.text).join(" ")
              : (lastMsg?.text || "");
            setConvoList((p) =>
              p.map((cv) => cv.id === c.id ? {
                ...cv,
                ...(previewText ? { lastPreview: previewText.slice(0, 60) } : {}),
                ...(sessionCwd && !cv.cwd ? { cwd: sessionCwd } : {}),
              } : cv)
            );
          }
        } catch {}
      }
    });
  }, [stateLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleNew = () => {
    setShowNewChatCard(true);
  };

  const handleToggleProjectCollapse = (cwdRoot) => {
    const projectRoot = getMainRepoRoot(cwdRoot);
    setProjects((prev) => ({
      ...prev,
      [projectRoot]: { ...prev[projectRoot], collapsed: !prev[projectRoot]?.collapsed },
    }));
  };

  const handleHideProject = (cwdRoot) => {
    const projectRoot = getMainRepoRoot(cwdRoot);
    setProjects((prev) => ({
      ...prev,
      [projectRoot]: { ...prev[projectRoot], hidden: true },
    }));
  };

  const handleNewInProject = (cwdRoot) => {
    const id = "c" + Date.now();
    const sessionId = crypto.randomUUID();
    const n = {
      id, sessionId,
      title: "New chat",
      model: defaultModel,
      ts: Date.now(),
      cwd: cwdRoot || undefined,
    };
    setConvoList((p) => [n, ...p]);
    setActive(id);
    setShowNewChatCard(false);
    if (cwdRoot && projects[cwdRoot]?.hidden) {
      setProjects((prev) => ({
        ...prev,
        [cwdRoot]: { ...prev[cwdRoot], hidden: false },
      }));
    }
  };

  const handleDelete = (id, e) => {
    e.stopPropagation();
    cancelMessage(id);
    const remaining = convoList.filter((c) => c.id !== id);
    setConvoList(remaining);
    if (active === id) setActive(remaining[0]?.id || null);
  };

  // Capture Codex thread_id for session resume
  useEffect(() => {
    if (!active) return;
    const data = getConversation(active);
    if (data._codexThreadId) {
      const convo = convoList.find(c => c.id === active);
      if (convo && convo.sessionId !== data._codexThreadId) {
        setConvoList((p) =>
          p.map((c) => c.id === active ? { ...c, sessionId: data._codexThreadId } : c)
        );
      }
    }
  }, [active, conversations]);

  const sendMessageToConversation = useCallback(
    async ({ conversationId, conversation, text, attachments }) => {
      if (!conversationId || !conversation) return false;

      const convoCwd = conversation.cwd;
      // null = explicit draft → use the shared drafts dir; undefined = legacy convo → fall back to app cwd
      const effectiveCwd = convoCwd === null
        ? (draftsPath || undefined)
        : (convoCwd !== undefined ? (convoCwd || undefined) : (cwd || undefined));
      const thisConvoData = getConversation(conversationId);
      const isFirstMessage = thisConvoData.messages.length === 0;
      const messageIndex = thisConvoData.messages.length;
      const images = attachments?.filter((a) => a.type === "image").map((a) => a.dataUrl);
      const files = attachments?.filter((a) => a.type === "file");
      const m = getM(conversation.model);
      const currentProvider = m.provider || "claude";
      const prevProvider = conversation.lastProvider;
      const providerSwitched =
        !isFirstMessage && prevProvider && prevProvider !== currentProvider;
      const prime = providerSwitched
        ? buildCrossProviderPrime(thisConvoData.messages)
        : null;
      const wirePrompt = prime ? decoratePromptWithPrime(text, prime) : text;
      const sendStartedAt = Date.now();

      if (isFirstMessage) {
        setConvoList((p) =>
          p.map((c) => c.id === conversationId ? { ...c, title: text.slice(0, 50) } : c)
        );
      }

      logSendFlow("handleSend:start", {
        conversationId,
        effectiveCwd,
        isFirstMessage,
        messageIndex,
      });

      const pendingId = prepareMessage({
        conversationId,
        prompt: text,
        images: images?.length ? images : undefined,
        files: files?.length ? files : undefined,
      });

      logSendFlow("handleSend:seeded", {
        conversationId,
        pendingId,
        elapsedMs: Date.now() - sendStartedAt,
      });

      // Create a git checkpoint before sending (for future edit rewind)
      if (effectiveCwd && window.api) {
        const checkpointStartedAt = Date.now();
        logCheckpoint("checkpointCreate:start", { cwdPath: effectiveCwd, conversationId, messageIndex });
        try {
          const cp = await window.api.checkpointCreate(effectiveCwd);
          logCheckpoint("checkpointCreate:success", {
            cwdPath: effectiveCwd,
            conversationId,
            messageIndex,
            ref: cp?.ref || null,
            durationMs: Date.now() - checkpointStartedAt,
            totalElapsedMs: Date.now() - sendStartedAt,
          });
          if (cp?.ref) {
            setConvoList((p) =>
              p.map((c) => {
                if (c.id !== conversationId) return c;
                const checkpoints = { ...(c.checkpoints || {}) };
                checkpoints[messageIndex] = cp.ref;
                return { ...c, checkpoints };
              })
            );
          }
        } catch (e) {
          logCheckpoint("checkpointCreate:failed", {
            cwdPath: effectiveCwd,
            conversationId,
            messageIndex,
            durationMs: Date.now() - checkpointStartedAt,
            totalElapsedMs: Date.now() - sendStartedAt,
            error: e.message,
          });
          console.warn("Checkpoint creation failed:", e.message);
        }
      }

      const started = startPreparedMessage({
        conversationId,
        pendingId,
        sessionId: isFirstMessage ? conversation.sessionId : undefined,
        resumeSessionId:
          isFirstMessage || providerSwitched ? undefined : conversation.sessionId,
        prompt: wirePrompt,
        model: m.cliFlag,
        provider: m.provider || "claude",
        effort: m.effort,
        cwd: effectiveCwd,
        images: images?.length ? images : undefined,
        files: files?.length ? files : undefined,
      });

      if (started) {
        const providerUsed = m.provider || "claude";
        setConvoList((p) =>
          p.map((c) => (c.id === conversationId ? { ...c, lastProvider: providerUsed } : c))
        );
      }

      logSendFlow("handleSend:agent-start", {
        conversationId,
        pendingId,
        started,
        totalElapsedMs: Date.now() - sendStartedAt,
      });

      return started;
    },
    [cwd, draftsPath, getConversation, prepareMessage, startPreparedMessage]
  );

  const handleSend = useCallback(
    async (text, attachments) => {
      // Handle slash commands client-side
      const trimmed = text.trim();
      if (trimmed.startsWith("/") && !trimmed.includes(" ")) {
        const cmd = trimmed.toLowerCase();
        if (cmd === "/clear" || cmd === "/new") {
          handleNew();
          return;
        }
        if (cmd === "/model") {
          // No-op — model picker is in the top bar
          return;
        }
        if (cmd === "/" || cmd.length <= 1) {
          return; // Don't send bare /
        }
        // /compact and others — send as regular text so Claude handles them
      }

      // Queue if currently streaming
      if (activeData.isStreaming && active) {
        messageQueue.current.push({ text, attachments });
        setQueuedMessages([...messageQueue.current]);
        return;
      }

      let convo = activeConvo;
      let convoId = active;

      // Auto-create conversation if none exists
      if (!convo) {
        const id = "c" + Date.now();
        const sessionId = crypto.randomUUID();
        convo = { id, sessionId, title: text.slice(0, 50), model: defaultModel, ts: Date.now(), cwd: getMainRepoRoot(cwd) || undefined };
        convoId = id;
        setConvoList((p) => [convo, ...p]);
        setActive(id);
      }

      await sendMessageToConversation({
        conversationId: convoId,
        conversation: convo,
        text,
        attachments,
      });
    },
    [activeConvo, active, activeData, cwd, defaultModel, sendMessageToConversation]
  );

  // Process queued messages when streaming ends
  useEffect(() => {
    if (!activeData.isStreaming && messageQueue.current.length > 0) {
      const next = messageQueue.current.shift();
      setQueuedMessages([...messageQueue.current]);
      setTimeout(() => handleSend(next.text, next.attachments), 300);
    }
  }, [activeData.isStreaming, handleSend]);

  const handleCreateChat = useCallback(async (opts) => {
    const id = "c" + Date.now();
    const sessionId = crypto.randomUUID();
    const effectiveCwd = opts.cwd !== undefined ? opts.cwd : (getMainRepoRoot(cwd) || undefined);
    const n = {
      id, sessionId,
      title: opts.title || opts.prompt?.slice(0, 50) || "New chat",
      model: opts.model || defaultModel,
      ts: Date.now(),
      cwd: effectiveCwd,
    };

    if (opts.worktree && !opts.branch) {
      throw new Error("A worktree requires a branch name.");
    }

    if (opts.branch && effectiveCwd) {
      if (opts.worktree) {
        const wtPath = `${effectiveCwd}/.worktrees/${opts.branch}`;
        await window.api?.gitWorktreeAdd(effectiveCwd, wtPath, opts.branch, {
          createBranch: true,
          startPoint: opts.worktreeBaseBranch,
        });
        n.cwd = wtPath;
      } else if (opts.branchMode === "existing") {
        await window.api?.gitCheckout(effectiveCwd, opts.branch);
      } else {
        await window.api?.gitCreateBranch(effectiveCwd, opts.branch);
      }
    }

    setConvoList((p) => [n, ...p]);
    setActive(id);
    setShowNewChatCard(false);

    const projectRoot = getMainRepoRoot(opts.cwd || effectiveCwd);
    if (projectRoot && !projects[projectRoot]) {
      setProjects((prev) => ({
        ...prev,
        [projectRoot]: { name: projectRoot.split("/").pop(), manual: true },
      }));
    }

    // Unhide if hidden
    if (projectRoot && projects[projectRoot]?.hidden) {
      setProjects((prev) => ({
        ...prev,
        [projectRoot]: { ...prev[projectRoot], hidden: false },
      }));
    }

    let prompt = opts.prompt || "";
    if (opts.issueContext) {
      prompt = `${opts.issueContext}\n\n${prompt}`;
    }

    if (prompt) {
      await sendMessageToConversation({
        conversationId: id,
        conversation: n,
        text: prompt,
        attachments: opts.attachments,
      });
    }
  }, [cwd, defaultModel, projects, sendMessageToConversation]);

  const handleCancel = useCallback(() => {
    if (active) cancelMessage(active);
  }, [active, cancelMessage]);

  const handleEdit = useCallback(
    async (messageIndex, newText) => {
      if (!activeConvo) return;
      const m = getM(activeConvo.model);
      const convoCwd = activeConvo.cwd || cwd || undefined;

      // Restore git checkpoint to the state before this message
      const checkpointRef = activeConvo.checkpoints?.[messageIndex];
      logCheckpoint("handleEdit", {
        convoId: active,
        messageIndex,
        checkpointRef: checkpointRef || null,
        convoCwd,
      });
      if (checkpointRef && convoCwd && window.api) {
        try {
          await window.api.checkpointRestore(convoCwd, checkpointRef);
        } catch (e) {
          console.error("Checkpoint restore failed:", e);
        }
      }

      const currentProvider = m.provider || "claude";
      const prevProvider = activeConvo.lastProvider;
      // For edits, treat it like a mid-chat send: if the last turn used a
      // different provider than the current one, prime.
      const providerSwitched = prevProvider && prevProvider !== currentProvider;
      const priorMessages = getConversation(active).messages.slice(0, messageIndex);
      const prime = providerSwitched
        ? buildCrossProviderPrime(priorMessages)
        : null;
      const wirePrompt = prime ? decoratePromptWithPrime(newText, prime) : newText;

      const started = editAndResend({
        conversationId: active,
        sessionId: providerSwitched ? undefined : activeConvo.sessionId,
        messageIndex,
        newText,
        wirePrompt,
        model: m.cliFlag,
        provider: currentProvider,
        effort: m.effort,
        cwd: convoCwd,
      });

      if (started) {
        setConvoList((p) =>
          p.map((c) => (c.id === active ? { ...c, lastProvider: currentProvider } : c))
        );
      }
    },
    [activeConvo, active, cwd, getConversation, editAndResend]
  );

  const handleModelChange = (modelId) => {
    if (active) {
      setConvoList((p) =>
        p.map((c) => (c.id === active ? { ...c, model: modelId } : c))
      );
    }
    setDefaultModel(modelId);
  };

  const handlePickFolder = async () => {
    if (!window.api) return;
    const folder = await window.api.pickFolder();
    if (folder) {
      setCwd(folder);
      // If there's an active conversation, copy its session to the new directory
      if (activeConvo && activeConvo.cwd !== folder) {
        try {
          await window.api.moveSession(activeConvo.sessionId, folder);
          setConvoList((p) =>
            p.map((c) => c.id === active ? { ...c, cwd: folder } : c)
          );
        } catch (e) {
          console.error("Failed to move session:", e);
        }
      }
    }
  };

  // Update saved preview when active conversation messages change
  useEffect(() => {
    if (active && activeData.messages.length > 0) {
      const lastMsg = activeData.messages[activeData.messages.length - 1];
      const msgText = lastMsg?.parts
        ? lastMsg.parts.filter(p => p.type === "text").map(p => p.text).join(" ")
        : (lastMsg?.text || "");
      const preview = msgText.slice(0, 60);
      if (preview) {
        setConvoList((p) =>
          p.map((c) => c.id === active ? { ...c, lastPreview: preview } : c)
        );
      }
    }
  }, [active, activeData.messages.length]);

  // Build convo object for ChatArea
  const convo = activeConvo
    ? {
        ...activeConvo,
        msgs: activeData.messages,
        isStreaming: activeData.isStreaming,
        error: activeData.error,
      }
    : null;

  // Build convos for Sidebar
  const convosForSidebar = convoList.map((c) => {
    const data = getConversation(c.id);
    const msgs = data.messages;
    const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;
    const lastText = lastMsg?.parts
      ? lastMsg.parts.filter(p => p.type === "text").map(p => p.text).join(" ")
      : (lastMsg?.text || "");
    const preview = lastText ? lastText.slice(0, 45) : null;
    return {
      ...c,
      msgs,
      lastPreview: preview || c.lastPreview || "Empty",
      isStreaming: data.isStreaming,
    };
  });

  // Refresh terminal sessions periodically (catches Claude-created sessions)
  useEffect(() => {
    terminal.refreshSessions();
    const interval = setInterval(() => terminal.refreshSessions(), 3000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const allCwdRoots = useMemo(() => {
    const roots = new Set();
    convoList.forEach(c => { if (c.cwd) roots.add(getMainRepoRoot(c.cwd)); });
    Object.keys(projects).forEach(r => roots.add(getMainRepoRoot(r)));
    return [...roots];
  }, [convoList, projects]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <FontSizeContext.Provider value={fontSize}>
    <div style={{ display: "flex", height: "100vh", width: "100vw", overflow: "hidden", position: "relative" }}>
      {wallpaper?.dataUrl ? (
        <div style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
        }}>
          <div style={{
            position: "absolute",
            inset: 0,
            backgroundImage: `url(${wallpaper.dataUrl})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
            filter: wallpaper.imgBlur ? `blur(${wallpaper.imgBlur}px)` : "none",
            transform: wallpaper.imgBlur ? "scale(1.05)" : "none", // prevent blur edge artifacts
          }} />
          {(wallpaper.imgDarken > 0) && (
            <div style={{
              position: "absolute",
              inset: 0,
              background: `rgba(0,0,0,${wallpaper.imgDarken / 100})`,
            }} />
          )}
        </div>
      ) : (
        <>
          <AuroraCanvas />
          <Grain />
        </>
      )}

      {/* Sidebar */}
      <div
        style={{
          width: sidebarOpen ? 264 : 0,
          minWidth: sidebarOpen ? 264 : 0,
          borderRight: sidebarOpen ? "1px solid rgba(255,255,255,0.025)" : "none",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          zIndex: 10,
          background: `rgba(0,0,0,${wallpaper?.dataUrl ? (wallpaper.opacity / 100) : 0.65})`,
          backdropFilter: wallpaper?.dataUrl ? "saturate(1.1)" : "blur(56px) saturate(1.1)",
          transition: "all .35s cubic-bezier(.16,1,.3,1)",
          overflow: "hidden",
        }}
      >
        <Sidebar
          convos={convosForSidebar}
          active={active}
          onSelect={handleSelect}
          onNew={handleNew}
          onDelete={handleDelete}
          onToggleSidebar={() => setSidebarOpen((o) => !o)}
          cwd={activeConvo?.cwd === null ? (draftsPath || undefined) : (activeConvo?.cwd || cwd)}
          onPickFolder={handlePickFolder}
          onOpenSettings={() => setShowSettings(true)}
          onOpenProjectManager={() => window.api?.openProjectManager()}
          projects={projects}
          onToggleProjectCollapse={handleToggleProjectCollapse}
          onHideProject={handleHideProject}
          onNewInProject={handleNewInProject}
          draftsCollapsed={draftsCollapsed}
          onToggleDraftsCollapsed={() => setDraftsCollapsed(p => !p)}
        />
      </div>

      {/* Main content: Settings or Chat */}
      {showSettings ? (
        <Settings
          wallpaper={wallpaper}
          onWallpaperChange={setWallpaper}
          fontSize={fontSize}
          onFontSizeChange={setFontSize}
          onClose={() => setShowSettings(false)}
        />
      ) : (
        <ChatArea
          convo={convo}
          onSend={handleSend}
          onCancel={handleCancel}
          onEdit={handleEdit}
          onToggleSidebar={() => setSidebarOpen((o) => !o)}
          sidebarOpen={sidebarOpen}
          onNew={handleNew}
          onModelChange={handleModelChange}
          defaultModel={defaultModel}
          queuedMessages={queuedMessages}
          onToggleTerminal={() => terminal.setDrawerOpen((o) => !o)}
          terminalOpen={terminal.drawerOpen}
          terminalCount={terminal.sessions.length}
          wallpaper={wallpaper}
          cwd={activeConvo?.cwd === null ? (draftsPath || undefined) : (activeConvo?.cwd || cwd)}
          onRefocusTerminal={terminal.focusActiveSession}
          onCwdChange={(newCwd) => {
            setCwd(newCwd);
            if (active) {
              // Assign a new sessionId so next message starts a fresh Claude session
              // in the new cwd instead of trying to --resume the old one
              setConvoList((p) =>
                p.map((c) => c.id === active ? { ...c, cwd: newCwd } : c)
              );
            }
          }}
          showNewChatCard={showNewChatCard}
          onCreateChat={handleCreateChat}
          onCancelNewChat={() => setShowNewChatCard(false)}
          allCwdRoots={allCwdRoots}
          projects={projects}
        />
      )}

      {/* Terminal drawer */}
      <TerminalDrawer
        sessions={terminal.sessions}
        activeSession={terminal.activeSession}
        onSelectSession={terminal.setActiveSession}
        onCreateSession={terminal.createSession}
        cwd={activeConvo?.cwd === null ? (draftsPath || undefined) : (activeConvo?.cwd || cwd)}
        onKillSession={terminal.killSession}
        onSendInput={terminal.sendInput}
        onResizeSession={terminal.resizeSession}
        drawerOpen={terminal.drawerOpen}
        onToggleDrawer={() => terminal.setDrawerOpen((o) => !o)}
        registerTerminal={terminal.registerTerminal}
        unregisterTerminal={terminal.unregisterTerminal}
        wallpaper={wallpaper}
      />
    </div>
    </FontSizeContext.Provider>
  );
}
