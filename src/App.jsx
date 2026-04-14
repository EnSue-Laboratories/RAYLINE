import { useState, useCallback, useEffect, useRef } from "react";
import AuroraCanvas from "./components/AuroraCanvas";
import Grain        from "./components/Grain";
import Sidebar      from "./components/Sidebar";
import ChatArea     from "./components/ChatArea";
import useAgent     from "./hooks/useAgent";
import useTerminal  from "./hooks/useTerminal";
import TerminalDrawer from "./components/TerminalDrawer";
import Settings     from "./components/Settings";
import { getM }     from "./data/models";
import { FontSizeContext } from "./contexts/FontSizeContext";

function logCheckpoint(...args) {
  console.log("[checkpoint-ui]", ...args);
}

export default function App() {
  const { conversations, getConversation, sendMessage, cancelMessage, editAndResend, loadMessages } = useAgent();
  const terminal = useTerminal();

  // convos: array of { id, sessionId, title, model, ts }
  const [convoList, setConvoList] = useState([]);
  const [active, setActive] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [defaultModel, setDefaultModel] = useState("sonnet");
  const [cwd, setCwd] = useState(null);
  const [stateLoaded, setStateLoaded] = useState(false);
  const [wallpaper, setWallpaper] = useState(null); // { path, opacity, blur }
  const [fontSize, setFontSize] = useState(15);
  const [showSettings, setShowSettings] = useState(false);
  const messageQueue = useRef([]);
  const [queuedMessages, setQueuedMessages] = useState([]);

  // Load state from file on mount
  useEffect(() => {
    if (!window.api) { setStateLoaded(true); return; }
    window.api.loadState().then((state) => {
      if (state) {
        if (state.convos) setConvoList(state.convos);
        if (state.active) setActive(state.active);
        if (state.cwd) setCwd(state.cwd);
        if (state.defaultModel) setDefaultModel(state.defaultModel);
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
      }
      setStateLoaded(true);
    });
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
      window.api.saveState({ convos: convoList, active, cwd, defaultModel, fontSize, wallpaper: wpSave });
    }, 300);
  }, [convoList, active, cwd, defaultModel, fontSize, wallpaper, stateLoaded]);

  const activeConvo = convoList.find((c) => c.id === active);
  const activeData  = active ? getConversation(active) : { messages: [], isStreaming: false, error: null };

  // Load messages from Claude Code session files when selecting a conversation
  const handleSelect = useCallback(async (id) => {
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
    const id = "c" + Date.now();
    const sessionId = crypto.randomUUID();
    const n = {
      id,
      sessionId,
      title: "New chat",
      model: defaultModel,
      ts: Date.now(),
      cwd: cwd || undefined,
    };
    setConvoList((p) => [n, ...p]);
    setActive(id);
  };

  const handleDelete = (id, e) => {
    e.stopPropagation();
    cancelMessage(id);
    const remaining = convoList.filter((c) => c.id !== id);
    setConvoList(remaining);
    if (active === id) setActive(remaining[0]?.id || null);
  };

  // Process queued messages when streaming ends
  useEffect(() => {
    if (!activeData.isStreaming && messageQueue.current.length > 0) {
      const next = messageQueue.current.shift();
      setQueuedMessages([...messageQueue.current]);
      setTimeout(() => handleSend(next.text, next.attachments), 300);
    }
  }, [activeData.isStreaming]);

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
        convo = { id, sessionId, title: text.slice(0, 50), model: defaultModel, ts: Date.now(), cwd: cwd || undefined };
        convoId = id;
        setConvoList((p) => [convo, ...p]);
        setActive(id);
      } else {
        // Update title from first message
        if (activeData.messages.length === 0) {
          setConvoList((p) =>
            p.map((c) => c.id === convoId ? { ...c, title: text.slice(0, 50) } : c)
          );
        }
      }

      const convoCwd = convo.cwd;
      const effectiveCwd = convoCwd || cwd || undefined;
      const thisConvoData = getConversation(convoId);
      const isFirstMessage = thisConvoData.messages.length === 0;

      // Create a git checkpoint before sending (for future edit rewind)
      if (effectiveCwd && window.api) {
        try {
          const cp = await window.api.checkpointCreate(effectiveCwd);
          if (cp?.ref) {
            const msgIdx = getConversation(convoId).messages.length;
            setConvoList((p) =>
              p.map((c) => {
                if (c.id !== convoId) return c;
                const checkpoints = { ...(c.checkpoints || {}) };
                checkpoints[msgIdx] = cp.ref;
                return { ...c, checkpoints };
              })
            );
          }
        } catch (e) {
          console.warn("Checkpoint creation failed:", e.message);
        }
      }

      const images = attachments?.filter((a) => a.type === "image").map((a) => a.dataUrl);
      const files  = attachments?.filter((a) => a.type === "file");
      const m = getM(convo.model);

      sendMessage({
        conversationId: convoId,
        sessionId: isFirstMessage ? convo.sessionId : undefined,
        resumeSessionId: isFirstMessage ? undefined : convo.sessionId,
        prompt: text,
        model: m.cliFlag,
        provider: m.provider || "claude",
        effort: m.effort,
        cwd: effectiveCwd,
        images: images?.length ? images : undefined,
        files: files?.length ? files : undefined,
      });
    },
    [activeConvo, active, activeData, cwd, sendMessage]
  );

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

      editAndResend({
        conversationId: active,
        sessionId: activeConvo.sessionId,
        messageIndex,
        newText,
        model: m.cliFlag,
        provider: m.provider || "claude",
        effort: m.effort,
        cwd: convoCwd,
      });
    },
    [activeConvo, active, cwd, editAndResend]
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
          cwd={activeConvo?.cwd || cwd}
          onPickFolder={handlePickFolder}
          onOpenSettings={() => setShowSettings(true)}
          onOpenProjectManager={() => window.api?.openProjectManager()}
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
          onModelChange={handleModelChange}
          defaultModel={defaultModel}
          queuedMessages={queuedMessages}
          onToggleTerminal={() => terminal.setDrawerOpen((o) => !o)}
          terminalOpen={terminal.drawerOpen}
          terminalCount={terminal.sessions.length}
          wallpaper={wallpaper}
          cwd={activeConvo?.cwd || cwd}
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
        />
      )}

      {/* Terminal drawer */}
      <TerminalDrawer
        sessions={terminal.sessions}
        activeSession={terminal.activeSession}
        onSelectSession={terminal.setActiveSession}
        onCreateSession={terminal.createSession}
        cwd={activeConvo?.cwd || cwd}
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
