import { useState } from "react";
import { ChevronRight, ChevronDown, Terminal, FileText, Pencil, Search, Code, Loader2 } from "lucide-react";
import { useFontScale } from "../contexts/FontSizeContext";

const BODY_PREVIEW_LIMIT = 2400;

const TOOL_ICONS = {
  Bash: Terminal,
  Read: FileText,
  Edit: Pencil,
  Grep: Search,
  Write: FileText,
  Glob: Search,
};

function truncate(str, max) {
  if (!str) return null;
  return str.length > max ? str.slice(0, max) + "..." : str;
}

function getToolLabel(tool) {
  if (!tool?.name) return "Tool";
  if (tool.args?.command && tool.name === tool.args.command) return "Command";
  if (tool.name.startsWith("/") || tool.name.includes(" -lc ") || tool.name.includes(" --")) {
    return "Command";
  }
  return tool.name;
}

function getPreview(tool) {
  const args = tool.args;
  if (!args || typeof args !== "object") return null;
  if (tool.name === "Bash") {
    let cmd = args.command?.replace(/\n/g, " ") || "";
    // Replace absolute/home paths with just the binary name
    cmd = cmd.replace(/(?:^|\s)[~/][\w.~/:-]+\/([\w.-]+)/g, (_, bin) => " " + bin);
    return truncate(cmd.trim(), 30);
  }
  if (args.command) {
    return truncate(args.command.replace(/\s+/g, " ").trim(), 48);
  }
  if (tool.name === "Read") return args.file_path?.split("/").pop();
  if (tool.name === "Edit") return args.file_path?.split("/").pop();
  if (tool.name === "Write") return args.file_path?.split("/").slice(-2).join("/");
  if (tool.name === "Grep") return truncate(args.pattern || args.query, 25);
  if (tool.name === "Glob") return truncate(args.pattern || args.glob, 25);
  if (tool.name === "Search") return truncate(args.query || args.pattern, 25);
  if (tool.name === "Agent") return truncate(args.description, 30);
  if (tool.name === "WebSearch") return truncate(args.query, 30);
  if (tool.name === "WebFetch") return truncate(args.url, 30);
  if (tool.name === "Skill") return args.skill || args.name || null;
  if (tool.name === "LSP") return truncate(args.method || args.action, 25);
  if (tool.name === "NotebookEdit") return args.file_path?.split("/").pop();
  return null;
}

function serializeValue(value) {
  if (value == null) return null;
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function ToolBody({ label, value, maxHeight, fontScale }) {
  const [showFull, setShowFull] = useState(false);
  const serialized = serializeValue(value);
  if (!serialized) return null;

  const isTrimmed = serialized.length > BODY_PREVIEW_LIMIT;
  const displayValue = !showFull && isTrimmed
    ? `${serialized.slice(0, BODY_PREVIEW_LIMIT)}\n\n... [truncated ${serialized.length - BODY_PREVIEW_LIMIT} chars]`
    : serialized;

  return (
    <div style={{ marginBottom: label === "ARGS" ? 8 : 0 }}>
      <div style={{
        color: "var(--text-muted)",
        marginBottom: 4,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
      }}>
        <span>{label}</span>
        {isTrimmed && (
          <button
            onClick={() => setShowFull((prev) => !prev)}
            style={{
              border: "none",
              background: "none",
              color: "var(--text-subtle)",
              cursor: "pointer",
              fontSize: fontScale(10),
              fontFamily: "var(--font-mono)",
              padding: 0,
            }}
          >
            {showFull ? "show less" : "show full"}
          </button>
        )}
      </div>
      <pre style={{
        color: "var(--text-secondary)",
        whiteSpace: "pre-wrap",
        wordBreak: "break-all",
        margin: 0,
        padding: 8,
        background: "var(--control-bg-contrast)",
        borderRadius: 6,
        fontSize: fontScale(10),
        maxHeight,
        overflow: "auto",
      }}>
        {displayValue}
      </pre>
    </div>
  );
}

export default function ToolCallBlock({ tool }) {
  const [expanded, setExpanded] = useState(false);
  const s = useFontScale();
  const Icon = TOOL_ICONS[tool.name] || Code;
  const isRunning = tool.status === "running";
  const preview = getPreview(tool);
  const toolLabel = getToolLabel(tool);

  return (
    <div
      style={{
        margin: "8px 0",
        borderRadius: 8,
        border: "1px solid var(--pane-border)",
        background: "var(--control-bg-subtle)",
        overflow: "hidden",
      }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          padding: "8px 12px",
          background: "none",
          border: "none",
          color: "var(--text-secondary)",
          cursor: "pointer",
          fontSize: s(11),
          fontFamily: "var(--font-mono)",
          textAlign: "left",
        }}
      >
        <Icon size={13} strokeWidth={1.5} />
        <span style={{
          color: "var(--text-primary)",
          flexShrink: 1,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>{toolLabel}</span>
        {preview && !expanded && (
          <span style={{
            color: "var(--text-muted)",
            fontSize: s(10),
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
            minWidth: 0,
          }}>
            {preview}
          </span>
        )}
        {!preview && <span style={{ flex: 1 }} />}
        <span style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
          {isRunning && (
            <Loader2 size={10} strokeWidth={2} style={{ color: "var(--text-muted)", animation: "spin 1s linear infinite" }} />
          )}
          {tool.status === "done" && (
            <span style={{ color: "var(--text-disabled)", fontSize: s(10) }}>done</span>
          )}
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </span>
      </button>

      {expanded && (
        <div style={{ padding: "0 12px 10px", fontSize: s(11), fontFamily: "var(--font-mono)" }}>
          {tool.args && Object.keys(tool.args).length > 0 && <ToolBody label="ARGS" value={tool.args} maxHeight={200} fontScale={s} />}
          {tool.result != null && <ToolBody label="RESULT" value={tool.result} maxHeight={300} fontScale={s} />}
        </div>
      )}
    </div>
  );
}
