import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Download, X } from "lucide-react";
import { useFontScale } from "../contexts/FontSizeContext";

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

function sanitizeFileNamePart(value, fallback) {
  const sanitized = String(value || "")
    .trim()
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return sanitized || fallback;
}

function downloadText(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function buildExportPayload(message, markdownText, modelId, messageIndex) {
  const parts = Array.isArray(message?.parts)
    ? message.parts.map((part) => {
      if (!part || typeof part !== "object") {
        return part;
      }

      if (part.type === "text") {
        return { type: "text", text: part.text || "" };
      }

      if (part.type === "thinking") {
        return { type: "thinking", text: part.text || "" };
      }

      if (part.type === "status") {
        return {
          type: "status",
          kind: part.kind || null,
          title: part.title || null,
          text: part.text || "",
        };
      }

      if (part.type === "tool") {
        return {
          type: "tool",
          id: part.id || null,
          name: part.name || null,
          callId: part.callId || null,
          input: part.input ?? null,
          output: part.output ?? null,
          status: part.status || null,
        };
      }

      return { ...part };
    })
    : null;

  return {
    exportedAt: new Date().toISOString(),
    messageIndex: Number.isFinite(messageIndex) ? messageIndex : null,
    id: message?.id || null,
    role: message?.role || "assistant",
    modelId: modelId || null,
    markdown: markdownText || "",
    text: message?.text || "",
    parts,
    toolCalls: Array.isArray(message?.toolCalls) ? message.toolCalls : null,
  };
}

function buildBaseFileName(message, messageIndex) {
  const role = sanitizeFileNamePart(message?.role, "message");
  const indexPart = Number.isFinite(messageIndex) ? String(messageIndex + 1).padStart(3, "0") : null;
  const idPart = sanitizeFileNamePart(message?.id, "export").slice(0, 24);
  return indexPart ? `${role}-${indexPart}-${idPart}` : `${role}-${idPart}`;
}

export default function ExportMessageBtn({ message, markdownText, modelId, messageIndex, title = "Export" }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("idle");
  const rootRef = useRef(null);
  const resetTimerRef = useRef(null);
  const s = useFontScale();
  const hasMarkdown = Boolean(markdownText?.trim());

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
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
      if (resetTimerRef.current) {
        window.clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  const queueReset = () => {
    if (resetTimerRef.current) {
      window.clearTimeout(resetTimerRef.current);
    }
    resetTimerRef.current = window.setTimeout(() => setStatus("idle"), 1600);
  };

  const setSuccess = () => {
    setStatus("success");
    queueReset();
  };

  const setError = () => {
    setStatus("error");
    queueReset();
  };

  const handleCopy = async () => {
    if (!hasMarkdown) {
      setError();
      return;
    }

    try {
      await copyText(markdownText);
      setOpen(false);
      setSuccess();
    } catch (error) {
      console.error("[ExportMessageBtn] Failed to copy markdown", error);
      setError();
    }
  };

  const handleDownloadMarkdown = () => {
    if (!hasMarkdown) {
      setError();
      return;
    }

    try {
      const baseName = buildBaseFileName(message, messageIndex);
      downloadText(markdownText, `${baseName}.md`, "text/markdown;charset=utf-8");
      setOpen(false);
      setSuccess();
    } catch (error) {
      console.error("[ExportMessageBtn] Failed to download markdown", error);
      setError();
    }
  };

  const handleDownloadJson = () => {
    try {
      const baseName = buildBaseFileName(message, messageIndex);
      const payload = buildExportPayload(message, markdownText, modelId, messageIndex);
      downloadText(`${JSON.stringify(payload, null, 2)}\n`, `${baseName}.json`, "application/json;charset=utf-8");
      setOpen(false);
      setSuccess();
    } catch (error) {
      console.error("[ExportMessageBtn] Failed to download JSON", error);
      setError();
    }
  };

  const color = status === "success"
    ? "rgba(160,200,140,0.7)"
    : status === "error"
      ? "rgba(255,160,160,0.75)"
      : "rgba(255,255,255,0.3)";

  return (
    <div
      ref={rootRef}
      data-copy-image-ignore="true"
      style={{ position: "relative", display: "inline-flex" }}
    >
      <button
        onClick={() => setOpen((value) => !value)}
        title={status === "success" ? "Exported" : status === "error" ? "Export failed" : title}
        aria-haspopup="menu"
        aria-expanded={open}
        data-copy-image-ignore="true"
        style={{
          background: "none",
          border: "none",
          color,
          cursor: "pointer",
          padding: "2px 4px",
          borderRadius: 3,
          transition: "color .2s",
          display: "inline-flex",
          alignItems: "center",
          gap: 3,
          fontSize: s(10),
          fontFamily: "'JetBrains Mono',monospace",
        }}
        onMouseEnter={(e) => {
          if (status === "idle") {
            e.currentTarget.style.color = "rgba(255,255,255,0.5)";
          }
        }}
        onMouseLeave={(e) => {
          if (status === "idle") {
            e.currentTarget.style.color = "rgba(255,255,255,0.3)";
          }
        }}
      >
        {status === "success"
          ? <Check size={12} strokeWidth={1.5} />
          : status === "error"
            ? <X size={12} strokeWidth={1.5} />
            : <Download size={12} strokeWidth={1.5} />}
        {status === "success"
          ? "done"
          : status === "error"
            ? "failed"
            : "export"}
        <ChevronDown size={11} strokeWidth={1.6} />
      </button>

      {open && (
        <div
          role="menu"
          data-copy-image-ignore="true"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            minWidth: 142,
            padding: 4,
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(19,20,26,0.96)",
            backdropFilter: "blur(20px)",
            boxShadow: "0 18px 40px rgba(0,0,0,0.32)",
            zIndex: 30,
          }}
        >
          <MenuButton
            label="Clipboard"
            disabled={!hasMarkdown}
            onClick={handleCopy}
          />
          <MenuButton
            label="Markdown"
            disabled={!hasMarkdown}
            onClick={handleDownloadMarkdown}
          />
          <MenuButton
            label="JSON"
            onClick={handleDownloadJson}
          />
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
          : hovered
            ? "rgba(255,255,255,0.08)"
            : "transparent",
        color: disabled
          ? "rgba(255,255,255,0.25)"
          : hovered
            ? "rgba(255,255,255,0.9)"
            : "rgba(255,255,255,0.62)",
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
