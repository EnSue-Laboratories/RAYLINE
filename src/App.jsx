import { useState, useCallback, useEffect, useRef } from "react";
import AuroraCanvas from "./components/AuroraCanvas";
import Grain        from "./components/Grain";
import Sidebar      from "./components/Sidebar";
import ChatArea     from "./components/ChatArea";
import useAgent     from "./hooks/useAgent";
import { getM }     from "./data/models";

export default function App() {
  const { conversations, getConversation, sendMessage, cancelMessage, editAndResend, loadMessages } = useAgent();

  // convos: array of { id, sessionId, title, model, ts }
  const [convoList, setConvoList] = useState([]);
  const [active, setActive] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [defaultModel, setDefaultModel] = useState("sonnet");
  const [cwd, setCwd] = useState(null);
  const [stateLoaded, setStateLoaded] = useState(false);
  const messageQueue = useRef([]);

  // Load state from file on mount
  useEffect(() => {
    if (!window.api) { setStateLoaded(true); return; }
    window.api.loadState().then((state) => {
      if (state) {
        if (state.convos) setConvoList(state.convos);
        if (state.active) setActive(state.active);
        if (state.cwd) setCwd(state.cwd);
        if (state.defaultModel) setDefaultModel(state.defaultModel);
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
      window.api.saveState({ convos: convoList, active, cwd, defaultModel });
    }, 300);
  }, [convoList, active, cwd, defaultModel, stateLoaded]);

  const activeConvo = convoList.find((c) => c.id === active);
  const activeData  = active ? getConversation(active) : { messages: [], isStreaming: false, error: null };

  // Load messages from Claude Code session files when selecting a conversation
  const handleSelect = useCallback(async (id) => {
    setActive(id);
    const convo = convoList.find((c) => c.id === id);
    const data = getConversation(id);
    if (convo && data.messages.length === 0 && window.api) {
      try {
        const msgs = await window.api.loadSession(convo.sessionId);
        if (msgs && msgs.length > 0) {
          loadMessages(id, msgs);
          // Update sidebar preview from loaded messages
          const lastMsg = msgs[msgs.length - 1];
          const previewText = lastMsg?.parts
            ? lastMsg.parts.filter(p => p.type === "text").map(p => p.text).join(" ")
            : (lastMsg?.text || "");
          if (previewText) {
            setConvoList((p) =>
              p.map((c) => c.id === id ? { ...c, lastPreview: previewText.slice(0, 60) } : c)
            );
          }
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
      if (!c.lastPreview || c.lastPreview === "Empty") {
        try {
          const msgs = await window.api.loadSession(c.sessionId);
          if (msgs && msgs.length > 0) {
            const lastMsg = msgs[msgs.length - 1];
            const previewText = lastMsg?.parts
              ? lastMsg.parts.filter(p => p.type === "text").map(p => p.text).join(" ")
              : (lastMsg?.text || "");
            if (previewText) {
              setConvoList((p) =>
                p.map((cv) => cv.id === c.id ? { ...cv, lastPreview: previewText.slice(0, 60) } : cv)
              );
            }
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
      model: "sonnet",
      ts: Date.now(),
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
      // Small delay to let the UI settle
      setTimeout(() => handleSend(next.text, next.attachments), 300);
    }
  }, [activeData.isStreaming]);

  const handleSend = useCallback(
    (text, attachments) => {
      // Queue if currently streaming
      if (activeData.isStreaming && active) {
        messageQueue.current.push({ text, attachments });
        return;
      }

      let convo = activeConvo;
      let convoId = active;

      // Auto-create conversation if none exists
      if (!convo) {
        const id = "c" + Date.now();
        const sessionId = crypto.randomUUID();
        convo = { id, sessionId, title: text.slice(0, 50), model: defaultModel, ts: Date.now() };
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

      const images = attachments?.filter((a) => a.type === "image").map((a) => a.dataUrl);
      const files  = attachments?.filter((a) => a.type === "file");
      const m = getM(convo.model);

      // First message uses --session-id (new session), subsequent use --resume
      // Check the actual conversation data for THIS convo, not the stale activeData
      const thisConvoData = getConversation(convoId);
      const isFirstMessage = thisConvoData.messages.length === 0;

      sendMessage({
        conversationId: convoId,
        sessionId: isFirstMessage ? convo.sessionId : undefined,
        resumeSessionId: isFirstMessage ? undefined : convo.sessionId,
        prompt: text,
        model: m.cliFlag,
        cwd: cwd || undefined,
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
    (messageIndex, newText) => {
      if (!activeConvo) return;
      const m = getM(activeConvo.model);
      editAndResend({
        conversationId: active,
        sessionId: activeConvo.sessionId,
        messageIndex,
        newText,
        model: m.cliFlag,
        cwd: cwd || undefined,
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
    if (folder) setCwd(folder);
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

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw", overflow: "hidden", position: "relative" }}>
      <AuroraCanvas />
      <Grain />

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
          background: "rgba(0,0,0,0.65)",
          backdropFilter: "blur(56px) saturate(1.1)",
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
          cwd={cwd}
          onPickFolder={handlePickFolder}
        />
      </div>

      {/* Main chat area */}
      <ChatArea
        convo={convo}
        onSend={handleSend}
        onCancel={handleCancel}
        onEdit={handleEdit}
        onToggleSidebar={() => setSidebarOpen((o) => !o)}
        sidebarOpen={sidebarOpen}
        onModelChange={handleModelChange}
        defaultModel={defaultModel}
      />
    </div>
  );
}
