import { useState, useCallback } from "react";
import AuroraCanvas from "./components/AuroraCanvas";
import Grain        from "./components/Grain";
import Sidebar      from "./components/Sidebar";
import ChatArea     from "./components/ChatArea";
import { CONVOS_INIT } from "./data/conversations";

const STUB_REPLY =
  "This is a frontend prototype. The adapter layer would stream the response here, token by token, through the unified ModelAdapter interface.";

export default function App() {
  const [convos, setConvos] = useState(CONVOS_INIT);
  const [active, setActive] = useState("1");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const convo = convos.find((c) => c.id === active);

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleNew = () => {
    const n = {
      id: "n" + Date.now(),
      title: "Untitled thread",
      model: "claude-opus",
      ts: "now",
      msgs: [],
    };
    setConvos((p) => [n, ...p]);
    setActive(n.id);
  };

  const handleDelete = (id, e) => {
    e.stopPropagation();
    const remaining = convos.filter((c) => c.id !== id);
    setConvos(remaining);
    if (active === id) setActive(remaining[0]?.id || null);
  };

  const handleSend = useCallback(
    (text) => {
      if (!convo) return;
      const userMsg  = { id: "u" + Date.now(), role: "user",      text };
      const replyMsg = { id: "a" + Date.now(), role: "assistant", text: STUB_REPLY };
      setConvos((p) =>
        p.map((c) =>
          c.id === active ? { ...c, msgs: [...c.msgs, userMsg, replyMsg], ts: "now" } : c
        )
      );
    },
    [convo, active]
  );

  const handleModelChange = (modelId) => {
    setConvos((p) =>
      p.map((c) => (c.id === active ? { ...c, model: modelId } : c))
    );
  };

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
          convos={convos}
          active={active}
          onSelect={setActive}
          onNew={handleNew}
          onDelete={handleDelete}
          onToggleSidebar={() => setSidebarOpen((o) => !o)}
        />
      </div>

      {/* Main chat area */}
      <ChatArea
        convo={convo}
        onSend={handleSend}
        onToggleSidebar={() => setSidebarOpen((o) => !o)}
        sidebarOpen={sidebarOpen}
        onModelChange={handleModelChange}
      />
    </div>
  );
}
