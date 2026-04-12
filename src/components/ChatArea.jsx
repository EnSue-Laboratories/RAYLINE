import { useState, useRef, useCallback, useEffect } from "react";
import { PanelLeft, ArrowRight, Square } from "lucide-react";
import Message from "./Message";
import EmptyState from "./EmptyState";
import ModelPicker from "./ModelPicker";
import ImagePreview from "./ImagePreview";

export default function ChatArea({ convo, onSend, onCancel, onEdit, onToggleSidebar, sidebarOpen, onModelChange, defaultModel }) {
  const [input, setInput]             = useState("");
  const [inputFocused, setInputFocused] = useState(false);
  const [attachments, setAttachments]   = useState([]);
  const endRef  = useRef(null);
  const inRef   = useRef(null);

  // Scroll to bottom on new messages and during streaming
  const lastMsg = convo?.msgs?.[convo.msgs.length - 1];
  const lastParts = lastMsg?.parts;
  const lastPartText = lastParts?.[lastParts.length - 1]?.text || lastMsg?.text;
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [convo?.msgs?.length, convo?.isStreaming, lastPartText]);

  const isStreaming = convo?.isStreaming;

  const send = useCallback(() => {
    if (isStreaming) return;
    if (!input.trim() && attachments.length === 0) return;
    onSend(input.trim(), attachments.length > 0 ? attachments : undefined);
    setInput("");
    setAttachments([]);
    if (inRef.current) inRef.current.style.height = "20px";
  }, [input, attachments, convo, onSend, isStreaming]);

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
    const files = e.dataTransfer?.files;
    if (!files) return;
    for (const file of files) {
      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          setAttachments((prev) => [...prev, { type: "image", dataUrl: ev.target.result, name: file.name }]);
        };
        reader.readAsDataURL(file);
      } else {
        setAttachments((prev) => [...prev, { type: "file", name: file.name, path: file.path }]);
      }
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const removeAttachment = (index) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, position: "relative", zIndex: 10 }}>
      {/* Sidebar open button — outside drag region */}
      {!sidebarOpen && (
        <button
          onClick={onToggleSidebar}
          style={{
            position: "fixed",
            top: 48,
            left: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 36,
            height: 36,
            borderRadius: 8,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.06)",
            color: "rgba(255,255,255,0.5)",
            cursor: "pointer",
            transition: "all .2s",
            zIndex: 100,
            WebkitAppRegion: "no-drag",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; e.currentTarget.style.color = "rgba(255,255,255,0.75)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.color = "rgba(255,255,255,0.5)"; }}
        >
          <PanelLeft size={16} strokeWidth={1.5} />
        </button>
      )}

      {/* Drag region matching sidebar spacer */}
      <div style={{ height: 52, WebkitAppRegion: "drag", flexShrink: 0 }} />

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
          maxWidth: sidebarOpen ? "none" : 640,
        }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, WebkitAppRegion: "no-drag" }}>

          {convo && (
            <div style={{ animation: "dropIn .2s ease" }}>
              <div style={{
                fontSize: 13,
                color: "rgba(255,255,255,0.88)",
                fontFamily: "system-ui,sans-serif",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: 300,
              }}>
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

        <div style={{ WebkitAppRegion: "no-drag" }}>
          <ModelPicker value={convo?.model || defaultModel || "sonnet"} onChange={onModelChange} />
        </div>
        </div>
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
          <EmptyState model={convo?.model || "sonnet"} />
        ) : (
          <div style={{ maxWidth: 640, width: "100%", margin: "0 auto", flex: 1 }}>
            {convo.msgs.map((m, i) => (
              <Message
                key={m.id}
                msg={m}
                onEdit={m.role === "user" ? (newText) => onEdit(i, newText) : undefined}
                onAnswer={m.role === "assistant" ? (text) => onSend(text) : undefined}
              />
            ))}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {/* Input bar */}
      <div
        style={{ padding: "12px 28px 24px", display: "flex", justifyContent: "center" }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        <div style={{ width: "100%", maxWidth: 560 }}>
          <ImagePreview items={attachments} onRemove={removeAttachment} />

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
              onPaste={handlePaste}
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
            {isStreaming ? (
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
                  background: "rgba(200,80,80,0.7)",
                  border: "none",
                  color: "#fff",
                  cursor: "pointer",
                  transition: "all .2s",
                }}
              >
                <Square size={12} fill="currentColor" />
              </button>
            ) : (
              <button
                onClick={send}
                disabled={!input.trim() && attachments.length === 0}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  flexShrink: 0,
                  background: (input.trim() || attachments.length > 0) ? "rgba(255,255,255,0.82)" : "rgba(255,255,255,0.02)",
                  border: "none",
                  color: (input.trim() || attachments.length > 0) ? "#000000" : "rgba(255,255,255,0.06)",
                  cursor: (input.trim() || attachments.length > 0) ? "pointer" : "default",
                  transition: "all .3s cubic-bezier(.16,1,.3,1)",
                  transform: (input.trim() || attachments.length > 0) ? "scale(1)" : "scale(0.88)",
                }}
              >
                <ArrowRight size={16} strokeWidth={1.5} />
              </button>
            )}
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
            ENTER TO SEND  //  SHIFT+ENTER NEWLINE  //  PASTE IMAGES
          </div>
        </div>
      </div>
    </div>
  );
}
