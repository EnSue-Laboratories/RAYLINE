import { memo, useEffect, useRef, useState } from "react";
import { Check, Download, X } from "lucide-react";
import { useFontScale } from "../contexts/FontSizeContext";
import {
  buildExportBaseFileName as buildBaseFileName,
  conversationToJson,
  conversationToMarkdown,
  copyText,
  downloadText,
  type ExportableConversation,
} from "../utils/exportHelpers";

type ExportStatus = "idle" | "success" | "error";

export interface ExportConversationBtnProps {
  convo: ExportableConversation | null | undefined;
  title?: string;
}

function ExportConversationBtn({ convo, title = "Export conversation" }: ExportConversationBtnProps) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<ExportStatus>("idle");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const resetTimerRef = useRef<number | null>(null);

  const messageCount = convo?.msgs?.length || 0;
  const canExport = messageCount > 0;

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (rootRef.current && !(event.target instanceof Node && rootRef.current.contains(event.target))) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
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
    ? "var(--accent)"
    : status === "error"
      ? "var(--accent)"
      : "var(--text-secondary)";
  const bgIdle = "var(--bg-tertiary)";
  const bgHover = "var(--hover-overlay)";
  const borderIdle = "var(--border)";
  const borderHover = "var(--border-strong)";

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
            border: "1px solid var(--border)",
            background: "var(--surface-glass)",
            backdropFilter: "blur(20px)",
            boxShadow: "var(--shadow-md)",
            zIndex: 30,
          }}
        >
          <MenuButton label="Clipboard" onClick={() => { void handleCopy(); }} />
          <MenuButton label="Markdown" onClick={handleDownloadMarkdown} />
          <MenuButton label="JSON" onClick={handleDownloadJson} />
        </div>
      )}
    </div>
  );
}

interface MenuButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

function MenuButton({ label, onClick, disabled = false }: MenuButtonProps) {
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
          : hovered ? "var(--hover-overlay)" : "transparent",
        color: disabled
          ? "var(--text-muted)"
          : hovered ? "var(--text-primary)" : "var(--text-secondary)",
        cursor: disabled ? "default" : "pointer",
        fontSize: s(11),
        fontFamily: "var(--font-mono)",
        textAlign: "left",
        transition: "background .15s, color .15s",
      }}
    >
      {label}
    </button>
  );
}

export default memo(ExportConversationBtn);
