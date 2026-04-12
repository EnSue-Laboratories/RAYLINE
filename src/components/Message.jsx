import { useState } from "react";
import { Pencil, Loader2 } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import "katex/dist/katex.min.css";
import CopyBtn from "./CopyBtn";
import ToolCallBlock from "./ToolCallBlock";
import AskUserQuestionBlock from "./AskUserQuestionBlock";
import MermaidBlock from "./MermaidBlock";

const mdComponents = {
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
            fontSize: 12,
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
        fontSize: 12,
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
    const rawText = codeNode?.children?.map(c => c.value || "").join("") || "";
    return (
      <pre style={{
        background: "rgba(0,0,0,0.4)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 8,
        padding: "12px 14px",
        overflow: "auto",
        fontSize: 12,
        fontFamily: "'JetBrains Mono',monospace",
        margin: "8px 0 12px",
        lineHeight: 1.6,
        position: "relative",
      }}>
        <div style={{ position: "absolute", top: 6, right: 6 }}>
          <CopyBtn text={rawText} />
        </div>
        {children}
      </pre>
    );
  },
  ul: ({ children }) => <ul style={{ paddingLeft: 20, margin: "4px 0 12px" }}>{children}</ul>,
  ol: ({ children }) => <ol style={{ paddingLeft: 20, margin: "4px 0 12px" }}>{children}</ol>,
  li: ({ children }) => <li style={{ marginBottom: 4 }}>{children}</li>,
  h1: ({ children }) => <h1 style={{ fontSize: 20, fontWeight: 600, margin: "16px 0 8px" }}>{children}</h1>,
  h2: ({ children }) => <h2 style={{ fontSize: 17, fontWeight: 600, margin: "14px 0 6px" }}>{children}</h2>,
  h3: ({ children }) => <h3 style={{ fontSize: 15, fontWeight: 600, margin: "12px 0 4px" }}>{children}</h3>,
  blockquote: ({ children }) => (
    <blockquote style={{
      borderLeft: "2px solid rgba(255,255,255,0.15)",
      paddingLeft: 14,
      margin: "8px 0",
      color: "rgba(255,255,255,0.5)",
      fontStyle: "italic",
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
      fontSize: 13,
    }}>{children}</table>
  ),
  thead: ({ children }) => <thead style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>{children}</thead>,
  th: ({ children }) => <th style={{ textAlign: "left", padding: "6px 12px 6px 0", fontWeight: 600, color: "rgba(255,255,255,0.7)" }}>{children}</th>,
  td: ({ children }) => <td style={{ padding: "4px 12px 4px 0", color: "rgba(255,255,255,0.55)" }}>{children}</td>,
  hr: () => <hr style={{ border: "none", borderTop: "1px solid rgba(255,255,255,0.08)", margin: "16px 0" }} />,
};

export default function Message({ msg, onEdit, onAnswer }) {
  const isUser = msg.role === "user";
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(msg.text);

  const handleSubmitEdit = () => {
    if (editText.trim() && editText !== msg.text) {
      onEdit?.(editText.trim());
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
      setEditText(msg.text);
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
          fontSize: 9,
          fontFamily: "'JetBrains Mono',monospace",
          color: "rgba(255,255,255,0.2)",
          letterSpacing: ".14em",
          marginBottom: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 8,
        }}>
          YOU
          {onEdit && !editing && (
            <button
              onClick={() => setEditing(true)}
              style={{
                background: "none",
                border: "none",
                color: "rgba(255,255,255,0.15)",
                cursor: "pointer",
                padding: 2,
                display: "flex",
                transition: "color .2s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.4)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.15)"; }}
            >
              <Pencil size={10} strokeWidth={1.5} />
            </button>
          )}
        </div>

        {editing ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={handleEditKeyDown}
              autoFocus
              style={{
                width: "100%",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8,
                color: "rgba(255,255,255,0.9)",
                fontSize: 14,
                lineHeight: 1.7,
                fontFamily: "system-ui,sans-serif",
                padding: "10px 12px",
                resize: "vertical",
                minHeight: 60,
              }}
            />
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={() => { setEditing(false); setEditText(msg.text); }}
                style={{
                  background: "none",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 6,
                  color: "rgba(255,255,255,0.4)",
                  padding: "4px 12px",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >Cancel</button>
              <button
                onClick={handleSubmitEdit}
                style={{
                  background: "rgba(255,255,255,0.8)",
                  border: "none",
                  borderRadius: 6,
                  color: "#000",
                  padding: "4px 12px",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >Send</button>
            </div>
          </div>
        ) : (
          <div style={{
            color: "rgba(255,255,255,0.92)",
            fontSize: 15,
            lineHeight: 1.7,
            fontFamily: "system-ui,-apple-system,sans-serif",
            fontWeight: 400,
            whiteSpace: "pre-wrap",
            textAlign: "left",
            maxWidth: "85%",
          }}>
            {msg.text}
          </div>
        )}

        {msg.images && msg.images.length > 0 && (
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 8 }}>
            {msg.images.map((img, i) => (
              <img key={i} src={img} alt="" style={{ height: 40, borderRadius: 6, opacity: 0.8 }} />
            ))}
          </div>
        )}
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
      <div style={{
        fontSize: 9,
        fontFamily: "'JetBrains Mono',monospace",
        color: "rgba(255,255,255,0.2)",
        letterSpacing: ".14em",
        marginBottom: 12,
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}>
        RESPONSE
        {msg.isThinking && (
          <span style={{ display: "flex", alignItems: "center", gap: 4, color: "rgba(255,255,255,0.25)" }}>
            <Loader2 size={10} strokeWidth={2} style={{ animation: "spin 1s linear infinite" }} />
            <span style={{ fontSize: 8 }}>thinking</span>
          </span>
        )}
      </div>

      {/* Render parts in order — text and tool calls interleaved */}
      {(msg.parts || []).map((part, i) => {
        if (part.type === "text" && part.text) {
          const isLastPart = i === (msg.parts || []).length - 1;
          return (
            <div key={i} style={{
              color: "rgba(255,255,255,0.75)",
              fontSize: 15,
              lineHeight: 1.85,
              fontFamily: "'Newsreader','Iowan Old Style',Georgia,serif",
              letterSpacing: "0.008em",
              marginBottom: 4,
            }}>
              <Markdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={mdComponents}>
                {part.text}
              </Markdown>
              {msg.isStreaming && isLastPart && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "rgba(255,255,255,0.2)", marginLeft: 4, verticalAlign: "middle" }}>
                  <Loader2 size={12} strokeWidth={2} style={{ animation: "spin 1s linear infinite" }} />
                </span>
              )}
            </div>
          );
        }
        if (part.type === "tool") {
          if (part.name === "AskUserQuestion") {
            return <AskUserQuestionBlock key={part.id || i} tool={part} onAnswer={onAnswer} />;
          }
          return <ToolCallBlock key={part.id || i} tool={part} />;
        }
        return null;
      })}

      {/* Fallback for old format messages (text + toolCalls) */}
      {!msg.parts && msg.text && (
        <div style={{
          color: "rgba(255,255,255,0.75)",
          fontSize: 15,
          lineHeight: 1.85,
          fontFamily: "'Newsreader','Iowan Old Style',Georgia,serif",
          letterSpacing: "0.008em",
        }}>
          <Markdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={mdComponents}>
            {msg.text}
          </Markdown>
        </div>
      )}
      {!msg.parts && msg.toolCalls && msg.toolCalls.map((tc) => (
        <ToolCallBlock key={tc.id} tool={tc} />
      ))}

      {!msg.isStreaming && (msg.parts?.some(p => p.type === "text" && p.text) || msg.text) && (
        <div style={{ marginTop: 8 }}>
          <CopyBtn text={
            msg.parts
              ? msg.parts.filter(p => p.type === "text").map(p => p.text).join("\n")
              : msg.text
          } />
        </div>
      )}
    </div>
  );
}
