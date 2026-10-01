import { memo, useMemo, useState, type CSSProperties } from "react";
import { ChevronRight, ChevronDown, Terminal, FileText, Pencil, Search, Code, Loader2, type LucideIcon } from "lucide-react";
import type { ToolPart } from "@shared/chat/types";
import { useFontScale, type FontScale } from "../contexts/FontSizeContext";
import { useTranslator } from "../contexts/LocaleContext";
import type { MessageKey } from "../i18n";
import {
  BODY_PREVIEW_LIMIT,
  buildToolBodyView,
  getToolLabel,
  getToolPreview,
  nextVisibleLimit,
  serializeToolValue,
} from "./blocks/toolCallSummary";

const TOOL_ICONS: Readonly<Record<string, LucideIcon>> = {
  Bash: Terminal,
  Read: FileText,
  Edit: Pencil,
  Grep: Search,
  Write: FileText,
  Glob: Search,
};

interface ToolBodyProps {
  label: "ARGS" | "RESULT";
  value: unknown;
  maxHeight: number;
  fontScale: FontScale;
}

const BODY_LABEL_KEYS = {
  ARGS: "tool.arguments",
  RESULT: "tool.result",
} as const satisfies Record<ToolBodyProps["label"], MessageKey>;

function ToolBody({ label, value, maxHeight, fontScale }: ToolBodyProps) {
  const t = useTranslator();
  // Large outputs are revealed incrementally (never all at once) so a 5 MB
  // result can't freeze the renderer; the stored value is untouched.
  const [visibleLimit, setVisibleLimit] = useState(BODY_PREVIEW_LIMIT);
  // Serialization + redaction are the expensive parts; redo them only when
  // the value or the visible window changes.
  const serialized = useMemo(() => serializeToolValue(value), [value]);
  const view = useMemo(
    () => (serialized ? buildToolBodyView(serialized, visibleLimit) : null),
    [serialized, visibleLimit],
  );
  if (!serialized || !view) return null;
  const hasMore = view.remaining > 0;

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
        <span>{t(BODY_LABEL_KEYS[label])}</span>
        {view.isTrimmed && (
          <button
            onClick={() => setVisibleLimit((prev) => nextVisibleLimit(serialized.length, prev))}
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
            {t(hasMore ? "tool.showMore" : "tool.showLess")}
          </button>
        )}
      </div>
      <pre style={{
        color: "var(--text-secondary)",
        whiteSpace: "pre-wrap",
        overflowWrap: "anywhere",
        wordBreak: "normal",
        lineBreak: "strict",
        margin: 0,
        padding: 8,
        background: "var(--control-bg-contrast)",
        borderRadius: 6,
        fontSize: fontScale(10),
        maxHeight,
        overflow: "auto",
      }}>
        {view.text}
        {hasMore && `\n\n${t("tool.remaining", { count: view.remaining })}`}
      </pre>
    </div>
  );
}

const ROOT_STYLE: CSSProperties = {
  margin: "8px 0",
  borderRadius: 8,
  border: "1px solid var(--pane-border)",
  background: "var(--control-bg-subtle)",
  overflow: "hidden",
};

/** Fields of a tool part the block actually renders. */
export type ToolCallBlockTool = Pick<ToolPart, "name" | "args" | "result" | "status">;

export interface ToolCallBlockProps {
  tool: ToolCallBlockTool;
}

function ToolCallBlock({ tool }: ToolCallBlockProps) {
  const t = useTranslator();
  const [expanded, setExpanded] = useState(false);
  const s = useFontScale();
  const Icon = TOOL_ICONS[tool.name] ?? Code;
  const isRunning = tool.status === "running";
  const preview = useMemo(() => getToolPreview(tool), [tool]);
  const toolLabel = getToolLabel(tool);
  const hasArgs = Boolean(tool.args) && Object.keys(tool.args).length > 0;

  return (
    <div style={ROOT_STYLE}>
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
            <span style={{ color: "var(--text-disabled)", fontSize: s(10) }}>{t("tool.done")}</span>
          )}
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </span>
      </button>

      {expanded && (
        <div style={{ padding: "0 12px 10px", fontSize: s(11), fontFamily: "var(--font-mono)" }}>
          {hasArgs && <ToolBody label="ARGS" value={tool.args} maxHeight={200} fontScale={s} />}
          {tool.result != null && <ToolBody label="RESULT" value={tool.result} maxHeight={300} fontScale={s} />}
        </div>
      )}
    </div>
  );
}

/**
 * Stream flushes currently clone every part (`{ ...part }`), so the `tool`
 * object identity changes even when nothing visible did. Compare the fields
 * we render instead; `args` / `result` keep their identity across clones.
 */
function areToolCallPropsEqual(prev: ToolCallBlockProps, next: ToolCallBlockProps): boolean {
  const a = prev.tool;
  const b = next.tool;
  return a === b || (a.name === b.name && a.status === b.status && a.args === b.args && a.result === b.result);
}

export default memo(ToolCallBlock, areToolCallPropsEqual);
