import { useEffect, useRef, useState } from "react";
import { Check, Download, X } from "lucide-react";
import { useFontScale } from "../contexts/FontSizeContext";
import {
  conversationToJson,
  conversationToMarkdown,
  copyText,
  downloadText,
  sanitizeFileNamePart,
} from "../utils/exportHelpers";

function buildBaseFileName(convo) {
  const title = sanitizeFileNamePart(convo?.title, "conversation").slice(0, 40);
  const idPart = sanitizeFileNamePart(convo?.id, "export").slice(0, 12);
  return `${title}-${idPart}`;
}

export default function ExportConversationBtn({ convo, title = "Export conversation" }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("idle");
  const rootRef = useRef(null);
  const resetTimerRef = useRef(null);
  useFontScale();

  const messageCount = convo?.msgs?.length || 0;
  const canExport = messageCount > 0;

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
    };
  }, []);

  const queueReset = () => {
    if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
    resetTimerRef.current = window.setTimeout(() => setStatus("idle"), 1600);
  };
  const setSuccess = () => { setStatus("success"); queueReset(); };
  const setError = () => { setStatus("error"); queueReset(); };

  const handleCopy = async () => {
    if (!canExport) { setError(); return; }
    try {
      await copyText(conversationToMarkdown(convo));
      setOpen(false);
      setSuccess();
    } catch (error) {
      console.error("[ExportConversationBtn] Failed to copy markdown", error);
      setError();
    }
  };

  const handleDownloadMarkdown = () => {
    if (!canExport) { setError(); return; }
    try {
      const baseName = buildBaseFileName(convo);
      downloadText(conversationToMarkdown(convo), `${baseName}.md`, "text/markdown;charset=utf-8");
      setOpen(false);
      setSuccess();
    } catch (error) {
      console.error("[ExportConversationBtn] Failed to download markdown", error);
      setError();
    }
  };

  const handleDownloadJson = () => {
    if (!canExport) { setError(); return; }
    try {
      const baseName = buildBaseFileName(convo);
      const payload = conversationToJson(convo);
      downloadText(`${JSON.stringify(payload, null, 2)}\n`, `${baseName}.json`, "application/json;charset=utf-8");
      setOpen(false);
      setSuccess();
    } catch (error) {
      console.error("[ExportConversationBtn] Failed to download JSON", error);
      setError();
    }
  };

  const color = status === "success"
    ? "rgba(160,200,140,0.85)"
    : status === "error"
      ? "rgba(255,160,160,0.9)"
      : "rgba(255,255,255,0.5)";
  const bgIdle = "rgba(255,255,255,0.04)";
  const bgHover = "rgba(255,255,255,0.1)";
  const borderIdle = "rgba(255,255,255,0.06)";
  const borderHover = "rgba(255,255,255,0.12)";

  return (
    <div
      ref={rootRef}
      style={{ position: "relative", display: "inline-flex" }}
    >
      <button
        onClick={() => canExport && setOpen((value) => !value)}
        disabled={!canExport}
        title={!canExport
          ? "No messages to export"
          : status === "success" ? "Exported" : status === "error" ? "Export failed" : title}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={title}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 26,
          height: 23,
          padding: 0,
          borderRadius: 7,
          background: open ? bgHover : bgIdle,
          border: "1px solid " + (open ? borderHover : borderIdle),
          color,
          cursor: canExport ? "pointer" : "default",
          opacity: canExport ? 1 : 0.5,
          transition: "all .2s",
        }}
        onMouseEnter={(e) => {
          if (!canExport) return;
          e.currentTarget.style.background = bgHover;
          e.currentTarget.style.borderColor = borderHover;
        }}
        onMouseLeave={(e) => {
          if (!canExport) return;
          if (!open) {
            e.currentTarget.style.background = bgIdle;
            e.currentTarget.style.borderColor = borderIdle;
          }
        }}
      >
        {status === "success"
          ? <Check size={14} strokeWidth={1.5} />
          : status === "error"
            ? <X size={14} strokeWidth={1.5} />
            : <Download size={14} strokeWidth={1.5} />}
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            minWidth: 160,
            padding: 4,
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(19,20,26,0.96)",
            backdropFilter: "blur(20px)",
            boxShadow: "0 18px 40px rgba(0,0,0,0.32)",
            zIndex: 30,
          }}
        >
          <MenuButton label="Clipboard" onClick={handleCopy} />
          <MenuButton label="Markdown" onClick={handleDownloadMarkdown} />
          <MenuButton label="JSON" onClick={handleDownloadJson} />
        </div>
      )}
    </div>
  );
}

function MenuButton({ label, onClick, disabled = false }) {
  const s = useFontScale();
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "7px 10px",
        borderRadius: 7,
        border: "none",
        background: disabled
          ? "transparent"
          : hovered ? "rgba(255,255,255,0.08)" : "transparent",
        color: disabled
          ? "rgba(255,255,255,0.25)"
          : hovered ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.62)",
        cursor: disabled ? "default" : "pointer",
        fontSize: s(11),
        fontFamily: "'JetBrains Mono',monospace",
        textAlign: "left",
        transition: "background .15s, color .15s",
      }}
    >
      {label}
    </button>
  );
}
