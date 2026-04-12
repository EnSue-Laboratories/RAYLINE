import { useState, useRef, useCallback, useEffect } from "react";
import { PanelLeft, ArrowRight } from "lucide-react";
import Message from "./Message";
import EmptyState from "./EmptyState";
import ModelPicker from "./ModelPicker";

export default function ChatArea({ convo, onSend, onToggleSidebar, sidebarOpen, onModelChange }) {
  const [input, setInput]             = useState("");
  const [inputFocused, setInputFocused] = useState(false);
  const endRef  = useRef(null);
  const inRef   = useRef(null);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [convo?.msgs?.length]);

  const send = useCallback(() => {
    if (!input.trim() || !convo) return;
    onSend(input.trim());
    setInput("");
    if (inRef.current) inRef.current.style.height = "20px";
  }, [input, convo, onSend]);

  const handleInput = (e) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "20px";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, position: "relative", zIndex: 10 }}>
      {/* Top bar */}
      <div
        style={{
          padding: "12px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid rgba(255,255,255,0.02)",
          background: "rgba(0,0,0,0.2)",
          backdropFilter: "blur(24px)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginLeft: -21, marginRight: -21 }}>
          {!sidebarOpen && (
            <button
              onClick={onToggleSidebar}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 32,
                height: 32,
                borderRadius: 7,
                background: "none",
                border: "none",
                color: "rgba(255,255,255,0.5)",
                cursor: "pointer",
                transition: "color .2s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.75)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.5)"; }}
            >
              <PanelLeft size={16} strokeWidth={1.5} />
            </button>
          )}

          {convo && (
            <div style={{ animation: "dropIn .2s ease" }}>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.88)", fontFamily: "system-ui,sans-serif" }}>
                {convo.title}
              </div>
              <div
                style={{
                  fontSize: 9,
                  fontFamily: "'JetBrains Mono',monospace",
                  color: "rgba(255,255,255,0.3)",
                  marginTop: 1,
                  letterSpacing: ".08em",
                }}
              >
                {convo.msgs.length} MESSAGES
              </div>
            </div>
          )}
        </div>

        {convo && <ModelPicker value={convo.model} onChange={onModelChange} />}
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "32px 28px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {!convo || convo.msgs.length === 0 ? (
          <EmptyState model={convo?.model || "claude-opus"} />
        ) : (
          <div style={{ maxWidth: 640, width: "100%", margin: "0 auto", flex: 1 }}>
            {convo.msgs.map((m) => (
              <Message key={m.id} msg={m} />
            ))}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {/* Input bar */}
      <div style={{ padding: "12px 28px 24px", display: "flex", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: 560 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "rgba(255,255,255,0.05)",
              border: "1px solid " + (inputFocused ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.07)"),
              borderRadius: 12,
              padding: "9px 14px",
              backdropFilter: "blur(20px)",
              transition: "border-color .25s",
            }}
          >
            <textarea
              ref={inRef}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              placeholder="Write something..."
              rows={1}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                resize: "none",
                color: "rgba(255,255,255,0.92)",
                fontSize: 13,
                lineHeight: "20px",
                fontFamily: "system-ui,sans-serif",
                maxHeight: 120,
                height: 20,
                display: "block",
                overflow: "hidden",
              }}
            />
            <button
              onClick={send}
              disabled={!input.trim()}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 30,
                height: 30,
                borderRadius: 8,
                flexShrink: 0,
                background: input.trim() ? "rgba(255,255,255,0.82)" : "rgba(255,255,255,0.02)",
                border: "none",
                color: input.trim() ? "#000000" : "rgba(255,255,255,0.06)",
                cursor: input.trim() ? "pointer" : "default",
                transition: "all .3s cubic-bezier(.16,1,.3,1)",
                transform: input.trim() ? "scale(1)" : "scale(0.88)",
              }}
            >
              <ArrowRight size={16} strokeWidth={1.5} />
            </button>
          </div>

          <div
            style={{
              textAlign: "center",
              marginTop: 8,
              fontSize: 8,
              fontFamily: "'JetBrains Mono',monospace",
              color: "rgba(255,255,255,0.15)",
              letterSpacing: ".1em",
            }}
          >
            ENTER TO SEND  //  SHIFT+ENTER NEWLINE
          </div>
        </div>
      </div>
    </div>
  );
}
