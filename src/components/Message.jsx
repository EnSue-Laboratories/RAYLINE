import { memo, useState, useMemo, useRef } from "react";
import { Pencil, FileText, PauseCircle, Terminal } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import "katex/dist/katex.min.css";
import CopyBtn from "./CopyBtn";
import CopyImageBtn from "./CopyImageBtn";
import ToolCallBlock from "./ToolCallBlock";
import AskUserQuestionBlock from "./AskUserQuestionBlock";
import MermaidBlock from "./MermaidBlock";
import InteractiveBlock from "./InteractiveBlock";
import ThinkingBlock from "./ThinkingBlock";
import ValueControlBlock from "./ValueControlBlock";
import LoadingStatus from "./LoadingStatus";
import { useFontScale } from "../contexts/FontSizeContext";

// Allow SVG tags in markdown (rehype-sanitize schema)
const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames || []), "svg", "path", "circle", "rect", "line", "polyline", "polygon", "ellipse", "g", "defs", "use", "text", "tspan", "marker", "pattern", "clipPath", "mask", "linearGradient", "radialGradient", "stop", "animate", "animateTransform", "animateMotion", "set", "foreignObject"],
  attributes: {
    ...defaultSchema.attributes,
    svg: ["viewBox", "width", "height", "xmlns", "fill", "stroke", "strokeWidth", "style", "class", "id", "preserveAspectRatio", "opacity"],
    path: ["d", "fill", "stroke", "strokeWidth", "strokeLinecap", "strokeLinejoin", "opacity", "transform", "style", "class", "id"],
    circle: ["cx", "cy", "r", "fill", "stroke", "strokeWidth", "opacity", "transform", "style", "class", "id"],
    rect: ["x", "y", "width", "height", "rx", "ry", "fill", "stroke", "strokeWidth", "opacity", "transform", "style", "class", "id"],
    line: ["x1", "y1", "x2", "y2", "stroke", "strokeWidth", "opacity", "transform", "style", "class", "id"],
    polyline: ["points", "fill", "stroke", "strokeWidth", "opacity", "transform", "style", "class", "id"],
    polygon: ["points", "fill", "stroke", "strokeWidth", "opacity", "transform", "style", "class", "id"],
    ellipse: ["cx", "cy", "rx", "ry", "fill", "stroke", "strokeWidth", "opacity", "transform", "style", "class", "id"],
    g: ["transform", "fill", "stroke", "strokeWidth", "opacity", "style", "class", "id"],
    text: ["x", "y", "dx", "dy", "textAnchor", "dominantBaseline", "fill", "fontSize", "fontFamily", "fontWeight", "transform", "style", "class", "id"],
    tspan: ["x", "y", "dx", "dy", "fill", "style", "class", "id"],
    linearGradient: ["id", "x1", "y1", "x2", "y2", "gradientUnits", "gradientTransform"],
    radialGradient: ["id", "cx", "cy", "r", "fx", "fy", "gradientUnits", "gradientTransform"],
    stop: ["offset", "stopColor", "stopOpacity", "style"],
    animate: ["attributeName", "from", "to", "dur", "repeatCount", "fill", "begin"],
    animateTransform: ["attributeName", "type", "from", "to", "dur", "repeatCount", "fill", "begin"],
    use: ["href", "x", "y", "width", "height"],
    defs: [],
    clipPath: ["id"],
    mask: ["id"],
    marker: ["id", "viewBox", "refX", "refY", "markerWidth", "markerHeight", "orient"],
    pattern: ["id", "x", "y", "width", "height", "patternUnits"],
    foreignObject: ["x", "y", "width", "height"],
  },
};

function PreBlock({ rawText, s = (x) => x, children }) {
  const [hovered, setHovered] = useState(false);
  return (
    <pre
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: "rgba(0,0,0,0.4)",
        border: "1px solid var(--pane-border)",
        borderRadius: 8,
        padding: "12px 14px",
        overflow: "auto",
        fontSize: s(12),
        fontFamily: "'JetBrains Mono',monospace",
        margin: "8px 0 12px",
        lineHeight: 1.6,
        position: "relative",
      }}
    >
      <div style={{ position: "absolute", top: 6, right: 6, opacity: hovered ? 1 : 0, transition: "opacity .15s" }}>
        <CopyBtn text={rawText} />
      </div>
      {children}
    </pre>
  );
}

const makeMdComponents = (isStreaming = false, s = (x) => x, onAnswer, onControlChange, canControlTarget) => ({
  p: ({ children }) => <p style={{ margin: "0 0 12px" }}>{children}</p>,
  code: ({ node, className, children, ...props }) => {
    const match = /language-(\w+)/.exec(className || "");
    const isBlock = node?.position?.start?.line !== node?.position?.end?.line
      || String(children).includes("\n");
    if (!isBlock) {
      return (
        <code style={{
          background: "rgba(255,255,255,0.06)",
          padding: "2px 5px",
          borderRadius: 4,
          fontSize: "0.85em",
          fontFamily: "'JetBrains Mono',monospace",
        }} {...props}>{children}</code>
      );
    }
    const codeString = String(children).replace(/\n$/, "");
    // Render interactive HTML blocks inline
    if (match && match[1] === "render") {
      return <InteractiveBlock code={codeString} isStreaming={isStreaming} />;
    }
    if (match && match[1] === "control") {
      return <ValueControlBlock json={codeString} isStreaming={isStreaming} onAnswer={onAnswer} onControlChange={onControlChange} canControlTarget={canControlTarget} />;
    }
    if (match) {
      return (
        <SyntaxHighlighter
          style={oneDark}
          language={match[1]}
          PreTag="div"
          customStyle={{
            background: "transparent",
            margin: 0,
            padding: 0,
            fontSize: s(12),
            fontFamily: "'JetBrains Mono',monospace",
            lineHeight: 1.6,
          }}
          codeTagProps={{ style: { fontFamily: "'JetBrains Mono',monospace" } }}
        >
          {codeString}
        </SyntaxHighlighter>
      );
    }
    return (
      <code style={{
        fontFamily: "'JetBrains Mono',monospace",
        fontSize: s(12),
      }} {...props}>{children}</code>
    );
  },
  pre: ({ node, children }) => {
    const codeNode = node?.children?.[0];
    const classes = codeNode?.properties?.className || [];
    if (classes.includes("language-mermaid")) {
      const text = codeNode?.children?.map(c => c.value || "").join("") || "";
      return <MermaidBlock code={text.replace(/\n$/, "")} />;
    }
    if (classes.includes("language-render")) {
      const text = codeNode?.children?.map(c => c.value || "").join("") || "";
      return <InteractiveBlock code={text.replace(/\n$/, "")} isStreaming={isStreaming} />;
    }
    if (classes.includes("language-control")) {
      const text = codeNode?.children?.map(c => c.value || "").join("") || "";
      return <ValueControlBlock json={text.replace(/\n$/, "")} isStreaming={isStreaming} onAnswer={onAnswer} onControlChange={onControlChange} canControlTarget={canControlTarget} />;
    }
    const rawText = codeNode?.children?.map(c => c.value || "").join("") || "";
    return <PreBlock rawText={rawText} s={s}>{children}</PreBlock>;
  },
  ul: ({ children }) => <ul style={{ paddingLeft: 20, margin: "4px 0 12px" }}>{children}</ul>,
  ol: ({ children }) => <ol style={{ paddingLeft: 20, margin: "4px 0 12px" }}>{children}</ol>,
  li: ({ children }) => <li style={{ marginBottom: 4 }}>{children}</li>,
  h1: ({ children }) => <h1 style={{ fontSize: s(20), fontWeight: 600, margin: "16px 0 8px" }}>{children}</h1>,
  h2: ({ children }) => <h2 style={{ fontSize: s(17), fontWeight: 600, margin: "14px 0 6px" }}>{children}</h2>,
  h3: ({ children }) => <h3 style={{ fontSize: s(15), fontWeight: 600, margin: "12px 0 4px" }}>{children}</h3>,
  blockquote: ({ children }) => (
    <blockquote style={{
      borderLeft: "2px solid rgba(255,255,255,0.15)",
      paddingLeft: 14,
      margin: "8px 0",
      color: "rgba(255,255,255,0.45)",
      fontFamily: "'Newsreader','Iowan Old Style',Georgia,serif",
      fontStyle: "italic",
      fontSize: s(13),
      lineHeight: 1.7,
    }}>{children}</blockquote>
  ),
  a: ({ href, children }) => {
    const safe = href && !href.startsWith("javascript:");
    return safe ? (
      <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: "rgba(140,180,255,0.8)", textDecoration: "none" }}
         onMouseEnter={(e) => { e.target.style.textDecoration = "underline"; }}
         onMouseLeave={(e) => { e.target.style.textDecoration = "none"; }}
      >{children}</a>
    ) : <span>{children}</span>;
  },
  strong: ({ children }) => <strong style={{ fontWeight: 600, color: "rgba(255,255,255,0.9)" }}>{children}</strong>,
  table: ({ children }) => (
    <table style={{
      width: "100%",
      borderCollapse: "collapse",
      margin: "8px 0 12px",
      fontSize: s(13),
    }}>{children}</table>
  ),
  thead: ({ children }) => <thead style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>{children}</thead>,
  th: ({ children }) => <th style={{ textAlign: "left", padding: "6px 12px 6px 0", fontWeight: 600, color: "rgba(255,255,255,0.7)" }}>{children}</th>,
  td: ({ children }) => <td style={{ padding: "4px 12px 4px 0", color: "rgba(255,255,255,0.55)" }}>{children}</td>,
  hr: () => <hr style={{ border: "none", borderTop: "1px solid var(--control-border)", margin: "16px 0" }} />,
});

// Escape non-standard HTML tags that rehype-raw would try to parse (e.g. <thinking>, </thinking>)
// Wrap them in inline code so they display as-is instead of breaking rendering
function sanitizeText(text) {
  if (!text) return text;
  return text.replace(/<\/?(?:thinking|antThinking)[^>]*>/gi, (match) => `\`${match}\``);
}

const CONTROL_BLOCK_RE = /```control\s*\n([\s\S]*?)```/g;

function splitControlBlocks(text) {
  if (!text) return [{ type: "markdown", text: "" }];

  const segments = [];
  let lastIndex = 0;
  let match;

  while ((match = CONTROL_BLOCK_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        type: "markdown",
        text: text.slice(lastIndex, match.index),
      });
    }

    segments.push({
      type: "control",
      json: match[1].replace(/\n$/, ""),
    });

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({
      type: "markdown",
      text: text.slice(lastIndex),
    });
  }

  return segments.length > 0 ? segments : [{ type: "markdown", text }];
}

function renderControlAwareMarkdown({
  text,
  blockKey,
  markdownProps,
  components,
  isStreaming = false,
  onAnswer,
  onControlChange,
  canControlTarget,
}) {
  return splitControlBlocks(text).map((segment, index) => {
    const key = `${blockKey}-${index}`;

    if (segment.type === "control") {
      return (
        <ValueControlBlock
          key={key}
          json={segment.json}
          isStreaming={isStreaming}
          onAnswer={onAnswer}
          onControlChange={onControlChange}
          canControlTarget={canControlTarget}
        />
      );
    }

    if (!segment.text) {
      return null;
    }

    return (
      <Markdown key={key} {...markdownProps} components={components}>
        {sanitizeText(segment.text)}
      </Markdown>
    );
  });
}

function Message({ msg, modelId, messageIndex, canEdit = false, onEdit, onAnswer, onControlChange, canControlTarget, wallpaper }) {
  const s = useFontScale();
  const scaledMdStatic = useMemo(() => makeMdComponents(false, s, onAnswer, onControlChange, canControlTarget), [canControlTarget, onAnswer, onControlChange, s]);
  const scaledMdStreaming = useMemo(() => makeMdComponents(true, s, onAnswer, onControlChange, canControlTarget), [canControlTarget, onAnswer, onControlChange, s]);
  const isUser = msg.role === "user";
  const isSystem = msg.role === "system";
  const isShellCommand = msg.mode === "shell-command";
  const hasThinkingPart = Boolean(msg.parts?.some((part) => part.type === "thinking"));
  const activeThinkingByStreamKey = msg._streamState?.activeThinking || {};
  const assistantCaptureRef = useRef(null);
  const assistantText = useMemo(() => {
    if (msg.parts) {
      return msg.parts
        .filter((part) => part.type === "text" && part.text)
        .map((part) => part.text)
        .join("\n");
    }
    return msg.text || "";
  }, [msg.parts, msg.text]);

  // Strip [Attached files/images: ...] prefix from display text and extract file names
  let displayText = msg.text || "";
  let extractedFiles = null;
  const attachedMatch = displayText.match(/^\[Attached (?:files|images):\n?([^\]]*)\]\n*/s);
  if (attachedMatch) {
    displayText = displayText.slice(attachedMatch[0].length);
    if (!msg.files || msg.files.length === 0) {
      extractedFiles = attachedMatch[1].split("\n").filter(Boolean).map(p => ({
        name: p.trim().split("/").pop(),
        path: p.trim(),
      }));
    }
  }
  const filesToShow = msg.files || extractedFiles;

  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(displayText);

  const editChanged = editText.trim() && editText.trim() !== displayText.trim();

  const handleSubmitEdit = () => {
    if (canEdit && editChanged) {
      onEdit?.(messageIndex, editText.trim());
    }
    setEditing(false);
  };

  const handleEditKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmitEdit();
    }
    if (e.key === "Escape") {
      setEditing(false);
      setEditText(displayText);
    }
  };

  if (isUser) {
    return (
      <div
        style={{
          marginBottom: 32,
          animation: "msgIn .4s cubic-bezier(.16,1,.3,1)",
          paddingTop: 28,
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
        }}
      >
        <div style={{
          fontSize: s(9),
          fontFamily: "'JetBrains Mono',monospace",
          color: "var(--text-secondary)",
          letterSpacing: ".14em",
          marginBottom: 10,
        }}>
          {isShellCommand ? "SHELL" : "USER"}
        </div>

        {editing ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, width: "100%" }}>
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={handleEditKeyDown}
              autoFocus
              style={{
                width: "100%",
                background: "var(--control-bg)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8,
                color: "rgba(255,255,255,0.9)",
                fontSize: s(15),
                lineHeight: 1.7,
                fontFamily: "'Newsreader','Iowan Old Style',Georgia,serif",
                padding: "10px 12px",
                resize: "vertical",
                minHeight: 60,
              }}
            />
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <button
                onClick={() => { setEditing(false); setEditText(msg.text); }}
                style={{
                  background: "none",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 6,
                  color: "rgba(255,255,255,0.4)",
                  padding: "4px 12px",
                  fontSize: s(11),
                  height: 26,
                  cursor: "pointer",
                }}
              >Cancel</button>
              <button
                onClick={handleSubmitEdit}
                disabled={!editChanged}
                style={{
                  background: editChanged ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.15)",
                  border: "1px solid transparent",
                  borderRadius: 6,
                  color: editChanged ? "#000" : "rgba(255,255,255,0.25)",
                  padding: "3px 12px",
                  fontSize: s(11),
                  height: 24,
                  cursor: editChanged ? "pointer" : "default",
                }}
              >Send</button>
            </div>
          </div>
        ) : (
          <>
            {msg.images && msg.images.length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", marginBottom: 8 }}>
                {msg.images.map((img, i) => (
                  <img key={i} src={img} alt="" style={{ height: 40, borderRadius: 6, opacity: 0.8 }} />
                ))}
              </div>
            )}

            {filesToShow && filesToShow.length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", marginBottom: 8 }}>
            {filesToShow.map((f, i) => (
              <div key={i} style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "4px 10px",
                background: "var(--control-bg)",
                border: "1px solid var(--control-border)",
                borderRadius: 6,
                fontSize: s(11),
                fontFamily: "'JetBrains Mono',monospace",
                color: "rgba(255,255,255,0.5)",
              }}>
                <FileText size={12} strokeWidth={1.5} />
                {f.name || f.path?.split("/").pop() || "file"}
              </div>
            ))}
          </div>
        )}

            {isShellCommand ? (
              <div
                style={{
                  width: "100%",
                  display: "flex",
                  justifyContent: "flex-end",
                }}
              >
                <div
                  style={{
                    width: "100%",
                    maxWidth: "85%",
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid var(--control-border)",
                    background: "linear-gradient(135deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02))",
                    color: "rgba(255,255,255,0.85)",
                    fontSize: s(12),
                    lineHeight: 1.6,
                    fontFamily: "'JetBrains Mono',monospace",
                    whiteSpace: "pre-wrap",
                    overflowWrap: "anywhere",
                  }}
                >
                  <span style={{ color: "rgba(255,255,255,0.5)" }}>$ </span>
                  {displayText}
                </div>
              </div>
            ) : (
              <div style={{
                color: "var(--text-primary)",
                fontSize: s(15),
                lineHeight: 1.7,
                fontFamily: "'Newsreader','Iowan Old Style',Georgia,serif",
                fontWeight: 400,
                textAlign: "left",
                maxWidth: "85%",
              }}>
                {renderControlAwareMarkdown({
                  text: displayText,
                  blockKey: `user-${msg.id}`,
                  markdownProps: { remarkPlugins: [remarkGfm] },
                  components: scaledMdStatic,
                  onAnswer,
                  onControlChange,
                  canControlTarget,
                })}
              </div>
            )}
          </>
        )}

        {!editing && (
          <div style={{ display: "flex", gap: 6, marginTop: 6, justifyContent: "flex-end" }}>
            <CopyBtn text={displayText} />
            {canEdit && onEdit && (
              <MsgBtn icon={<Pencil size={10} strokeWidth={1.5} />} onClick={() => setEditing(true)} />
            )}
          </div>
        )}
      </div>
    );
  }

  if (isSystem) {
    return (
      <div
        style={{
          marginBottom: 28,
          animation: "msgIn .4s cubic-bezier(.16,1,.3,1)",
          textAlign: "left",
        }}
      >
        <div
          style={{
            maxWidth: "88%",
            padding: "14px 16px 12px",
            borderRadius: 14,
            border: "1px solid var(--control-border)",
            background: "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))",
            boxShadow: "0 20px 40px rgba(0,0,0,0.18)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 10,
              fontSize: s(9),
              fontFamily: "'JetBrains Mono',monospace",
              color: "var(--text-secondary)",
              letterSpacing: ".14em",
            }}
          >
            <Terminal size={12} strokeWidth={1.7} />
            OUTPUT
          </div>
          <div
            style={{
              color: "rgba(255,255,255,0.82)",
              fontSize: s(14),
              lineHeight: 1.75,
              fontFamily: "'Newsreader','Iowan Old Style',Georgia,serif",
              letterSpacing: "0.006em",
            }}
          >
            <Markdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema], rehypeKatex]} components={scaledMdStatic}>
              {sanitizeText(displayText)}
            </Markdown>
          </div>
        </div>
        <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
          <CopyBtn text={displayText} />
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div
      style={{
        marginBottom: 44,
        animation: "msgIn .4s cubic-bezier(.16,1,.3,1)",
        textAlign: "left",
        paddingTop: 8,
      }}
    >
      <div ref={assistantCaptureRef}>
        <div style={{
          fontSize: s(9),
          fontFamily: "'JetBrains Mono',monospace",
          color: "var(--text-secondary)",
          letterSpacing: ".14em",
          marginBottom: 12,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}>
          ASSISTANT
        </div>

        {/* Render parts in order — text and tool calls interleaved */}
        {(msg.parts || []).map((part, i) => {
          if (part.type === "text" && part.text) {
            const isLastPart = i === (msg.parts || []).length - 1;
            return (
              <div key={i} style={{
                color: "var(--text-primary)",
                fontSize: s(15),
                lineHeight: 1.85,
                fontFamily: "'Newsreader','Iowan Old Style',Georgia,serif",
                letterSpacing: "0.008em",
                marginBottom: 4,
              }}>
                {renderControlAwareMarkdown({
                  text: part.text,
                  blockKey: `part-${part.id || i}`,
                  markdownProps: {
                    remarkPlugins: [remarkGfm, remarkMath],
                    rehypePlugins: [rehypeRaw, [rehypeSanitize, sanitizeSchema], rehypeKatex],
                  },
                  components: (msg.isStreaming && isLastPart) ? scaledMdStreaming : scaledMdStatic,
                  isStreaming: msg.isStreaming && isLastPart,
                  onAnswer,
                  onControlChange,
                  canControlTarget,
                })}
              </div>
            );
          }
          if (part.type === "thinking") {
            const isPartThinking = part._streamKey
              ? Boolean(activeThinkingByStreamKey[part._streamKey])
              : msg.isThinking;
            return (
              <div key={"think-" + i} data-copy-image-ignore="true">
                <ThinkingBlock text={part.text} isThinking={isPartThinking} />
              </div>
            );
          }
          if (part.type === "tool") {
            return (
              <div key={part.id || i} data-copy-image-ignore="true">
                {part.name === "AskUserQuestion"
                  ? <AskUserQuestionBlock tool={part} onAnswer={onAnswer} />
                  : <ToolCallBlock tool={part} />}
              </div>
            );
          }
          if (part.type === "status") {
            const isPaused = part.kind === "paused";
            return (
              <div
                key={`status-${i}`}
                data-copy-image-ignore="true"
                style={{
                  margin: "10px 0 14px",
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid var(--control-border)",
                  background: isPaused ? "rgba(255,214,153,0.08)" : "var(--control-bg)",
                  color: "rgba(255,255,255,0.72)",
                  maxWidth: "80%",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: s(11),
                    fontFamily: "'JetBrains Mono',monospace",
                    letterSpacing: ".04em",
                    textTransform: "uppercase",
                    color: isPaused ? "rgba(255,220,170,0.9)" : "rgba(255,255,255,0.6)",
                  }}
                >
                  {isPaused && <PauseCircle size={14} strokeWidth={1.8} />}
                  <span>{part.title || "Status"}</span>
                </div>
                {part.text && (
                  <div
                    style={{
                      marginTop: 6,
                      fontSize: s(13),
                      lineHeight: 1.65,
                      fontFamily: "'Newsreader','Iowan Old Style',Georgia,serif",
                      color: "rgba(255,255,255,0.66)",
                    }}
                  >
                    {part.text}
                  </div>
                )}
              </div>
            );
          }
          return null;
        })}

        {msg.isThinking && !hasThinkingPart && (
          <div data-copy-image-ignore="true">
            <ThinkingBlock text="" isThinking={true} />
          </div>
        )}

        {(msg.isStreaming || msg._usage || msg._rateLimits || msg._startedAt || msg._elapsedMs != null) && (
          <div data-copy-image-ignore="true">
            <LoadingStatus
              startedAt={msg._startedAt}
              elapsedMs={msg._elapsedMs}
              usage={msg._usage}
              rateLimits={msg._rateLimits}
              isStreaming={Boolean(msg.isStreaming)}
              modelId={modelId}
              compacting={Boolean(msg._compacting)}
            />
          </div>
        )}

        {/* Fallback for old format messages (text + toolCalls) */}
        {!msg.parts && msg.text && (
          <div style={{
            color: "var(--text-primary)",
            fontSize: s(15),
            lineHeight: 1.85,
            fontFamily: "'Newsreader','Iowan Old Style',Georgia,serif",
            letterSpacing: "0.008em",
          }}>
            {renderControlAwareMarkdown({
              text: msg.text,
              blockKey: `legacy-${msg.id}`,
              markdownProps: {
                remarkPlugins: [remarkGfm, remarkMath],
                rehypePlugins: [rehypeRaw, [rehypeSanitize, sanitizeSchema], rehypeKatex],
              },
              components: scaledMdStatic,
              onAnswer,
              onControlChange,
              canControlTarget,
            })}
          </div>
        )}
        {!msg.parts && msg.toolCalls && msg.toolCalls.map((tc) => (
          <div key={tc.id} data-copy-image-ignore="true">
            <ToolCallBlock tool={tc} />
          </div>
        ))}
      </div>

      {!msg.isStreaming && assistantText && (
        <div data-copy-image-ignore="true" style={{ marginTop: 8, display: "flex", gap: 6 }}>
          <CopyBtn text={assistantText} title="Copy markdown" />
          <CopyImageBtn targetRef={assistantCaptureRef} wallpaper={wallpaper} />
        </div>
      )}
    </div>
  );
}

export default memo(Message);

function MsgBtn({ icon, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "none",
        border: "none",
        color: "rgba(255,255,255,0.3)",
        cursor: "pointer",
        padding: "2px 4px",
        display: "inline-flex",
        alignItems: "center",
        borderRadius: 3,
        transition: "color .2s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.5)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.3)"; }}
    >
      {icon}
    </button>
  );
}
