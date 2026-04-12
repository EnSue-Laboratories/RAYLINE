import { useState } from "react";
import { ChevronRight, ChevronDown, Terminal, FileText, Pencil, Search, Code, Loader2 } from "lucide-react";

const TOOL_ICONS = {
  Bash: Terminal,
  Read: FileText,
  Edit: Pencil,
  Grep: Search,
  Write: FileText,
  Glob: Search,
};

export default function ToolCallBlock({ tool }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = TOOL_ICONS[tool.name] || Code;
  const isRunning = tool.status === "running";

  return (
    <div
      style={{
        margin: "6px 0",
        borderRadius: 8,
        border: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(255,255,255,0.02)",
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
          padding: "7px 12px",
          background: "none",
          border: "none",
          color: "rgba(255,255,255,0.5)",
          cursor: "pointer",
          fontSize: 11,
          fontFamily: "'JetBrains Mono',monospace",
          textAlign: "left",
        }}
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Icon size={13} strokeWidth={1.5} />
        <span style={{ color: "rgba(255,255,255,0.7)" }}>{tool.name}</span>
        {isRunning && (
          <Loader2 size={10} strokeWidth={2} style={{ color: "rgba(255,255,255,0.3)", animation: "spin 1s linear infinite", marginLeft: 2 }} />
        )}
        {tool.status === "done" && (
          <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 10 }}>done</span>
        )}
      </button>

      {expanded && (
        <div style={{ padding: "0 12px 10px", fontSize: 11, fontFamily: "'JetBrains Mono',monospace" }}>
          {tool.args && Object.keys(tool.args).length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ color: "rgba(255,255,255,0.3)", marginBottom: 4 }}>ARGS</div>
              <pre style={{
                color: "rgba(255,255,255,0.5)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                margin: 0,
                padding: 8,
                background: "rgba(0,0,0,0.3)",
                borderRadius: 6,
                fontSize: 10,
                maxHeight: 200,
                overflow: "auto",
              }}>
                {typeof tool.args === "string" ? tool.args : JSON.stringify(tool.args, null, 2)}
              </pre>
            </div>
          )}
          {tool.result != null && (
            <div>
              <div style={{ color: "rgba(255,255,255,0.3)", marginBottom: 4 }}>RESULT</div>
              <pre style={{
                color: "rgba(255,255,255,0.5)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                margin: 0,
                padding: 8,
                background: "rgba(0,0,0,0.3)",
                borderRadius: 6,
                fontSize: 10,
                maxHeight: 300,
                overflow: "auto",
              }}>
                {typeof tool.result === "string" ? tool.result : JSON.stringify(tool.result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
