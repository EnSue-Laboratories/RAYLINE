import { useState, useCallback, useEffect } from "react";
import AuroraCanvas from "./components/AuroraCanvas";
import Grain        from "./components/Grain";
import Sidebar      from "./components/Sidebar";
import ChatArea     from "./components/ChatArea";
import useAgent     from "./hooks/useAgent";
import { getM }     from "./data/models";

export default function App() {
  const { conversations, getConversation, sendMessage, cancelMessage, editAndResend, loadMessages } = useAgent();

  // convos: array of { id, sessionId, title, model, ts }
  const [convoList, setConvoList] = useState(() => {
    try {
      const saved = localStorage.getItem("ensue-convos");
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [active, setActive] = useState(() => {
    try { return localStorage.getItem("ensue-active") || null; } catch { return null; }
  });
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [defaultModel, setDefaultModel] = useState("sonnet");
  const [cwd, setCwd] = useState(() => {
    try { return localStorage.getItem("ensue-cwd") || null; } catch { return null; }
  });

  // Persist state
  useEffect(() => {
    localStorage.setItem("ensue-convos", JSON.stringify(convoList));
  }, [convoList]);
  useEffect(() => {
    if (active) localStorage.setItem("ensue-active", active);
  }, [active]);
  useEffect(() => {
    if (cwd) localStorage.setItem("ensue-cwd", cwd);
  }, [cwd]);

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
        }
      } catch (e) {
        console.error("Failed to load session:", e);
      }
    }
  }, [convoList, getConversation, loadMessages]);

  // Load active conversation on mount
  useEffect(() => {
    if (active) handleSelect(active);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  const handleSend = useCallback(
    (text, attachments) => {
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
      const hasMessages = activeData.messages.length > 0;

      sendMessage({
        conversationId: convoId,
        sessionId: hasMessages ? undefined : convo.sessionId,
        resumeSessionId: hasMessages ? convo.sessionId : undefined,
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
