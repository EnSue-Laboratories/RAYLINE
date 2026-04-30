import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Loader2, Plus, X } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import "katex/dist/katex.min.css";
import useAgent from "./hooks/useAgent";
import { loadOpenCodeState } from "./opencode/store";

const PANEL_BG = "rgba(13, 14, 18, 0.86)";
const PANEL_BORDER = "rgba(255,255,255,0.10)";
const PANEL_RADIUS = 18;
const HEADER_HEIGHT = 60;
const MIN_PANEL_HEIGHT = 76;
const MAX_PANEL_HEIGHT = 620;

function uid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getOpenCodeEntry(runtime) {
  if (runtime?.provider !== "opencode") return null;
  const state = loadOpenCodeState();
  return (state.models || []).find((model) => (
    model.providerId === runtime.providerId &&
    model.modelId === runtime.modelId
  )) || null;
}

function getOpenCodeRuntimeConfig(runtime) {
  const entry = getOpenCodeEntry(runtime);
  if (!entry) return undefined;
  return {
    providerId: entry.providerId || runtime.providerId || "",
    modelId: entry.modelId || runtime.modelId || "",
    apiKey: entry.apiKey || "",
    baseURL: entry.baseURL || "",
  };
}

function getRuntimeThinking(runtime) {
  const entry = getOpenCodeEntry(runtime);
  if (typeof entry?.thinking === "boolean") return entry.thinking;
  return typeof runtime?.thinking === "boolean" ? runtime.thinking : undefined;
}

function extractNativeSessionId(event) {
  if (!event || typeof event !== "object") return "";
  if (event.session_id) return event.session_id;
  if (event.thread_id) return event.thread_id;
  if (event.type === "thread.started" && event.thread_id) return event.thread_id;
  if (event.type === "session_meta" && event.payload?.id) return event.payload.id;
  return (
    event.sessionID ||
    event.sessionId ||
    event.session?.id ||
    event.part?.sessionID ||
    ""
  );
}

const MARKDOWN_COMPONENTS = {
  p: ({ children }) => <p style={{ margin: "0 0 10px" }}>{children}</p>,
  ul: ({ children }) => <ul style={{ paddingLeft: 20, margin: "4px 0 10px" }}>{children}</ul>,
  ol: ({ children }) => <ol style={{ paddingLeft: 20, margin: "4px 0 10px" }}>{children}</ol>,
  li: ({ children }) => <li style={{ marginBottom: 4 }}>{children}</li>,
  h1: ({ children }) => <h1 style={{ fontSize: 18, fontWeight: 600, margin: "12px 0 6px" }}>{children}</h1>,
  h2: ({ children }) => <h2 style={{ fontSize: 16, fontWeight: 600, margin: "10px 0 6px" }}>{children}</h2>,
  h3: ({ children }) => <h3 style={{ fontSize: 14, fontWeight: 600, margin: "10px 0 4px" }}>{children}</h3>,
  strong: ({ children }) => <strong style={{ fontWeight: 600, color: "rgba(255,255,255,0.95)" }}>{children}</strong>,
  blockquote: ({ children }) => (
    <blockquote
      style={{
        borderLeft: "2px solid rgba(255,255,255,0.18)",
        paddingLeft: 12,
        margin: "6px 0 10px",
        color: "rgba(255,255,255,0.55)",
        fontStyle: "italic",
      }}
    >
      {children}
    </blockquote>
  ),
  a: ({ href, children }) => {
    const safe = href && !href.startsWith("javascript:");
    return safe ? (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: "rgba(150,190,255,0.85)", textDecoration: "none" }}
      >
        {children}
      </a>
    ) : (
      <span>{children}</span>
    );
  },
  hr: () => (
    <hr style={{ border: "none", borderTop: "1px solid rgba(255,255,255,0.08)", margin: "12px 0" }} />
  ),
  code: ({ inline, className, children, ...props }) => {
    const match = /language-(\w+)/.exec(className || "");
    const codeString = String(children).replace(/\n$/, "");
    const isBlock = !inline && (match || codeString.includes("\n"));

    if (!isBlock) {
      return (
        <code
          style={{
            background: "rgba(255,255,255,0.06)",
            padding: "1px 5px",
            borderRadius: 4,
            fontSize: "0.86em",
            fontFamily: "'JetBrains Mono','SF Mono',Menlo,monospace",
          }}
          {...props}
        >
          {children}
        </code>
      );
    }

    if (match) {
      return (
        <SyntaxHighlighter
          style={oneDark}
          language={match[1]}
          PreTag="div"
          customStyle={{
            background: "rgba(0,0,0,0.45)",
            border: "1px solid rgba(255,255,255,0.06)",
            margin: "8px 0 10px",
            padding: "10px 12px",
            borderRadius: 8,
            fontSize: 12,
            lineHeight: 1.6,
          }}
          codeTagProps={{ style: { fontFamily: "'JetBrains Mono','SF Mono',Menlo,monospace" } }}
        >
          {codeString}
        </SyntaxHighlighter>
      );
    }

    return (
      <pre
        style={{
          background: "rgba(0,0,0,0.4)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 8,
          padding: "10px 12px",
          overflow: "auto",
          fontSize: 12,
          fontFamily: "'JetBrains Mono','SF Mono',Menlo,monospace",
          margin: "8px 0 10px",
          lineHeight: 1.6,
        }}
      >
        <code {...props}>{children}</code>
      </pre>
    );
  },
};

function getAssistantText(message) {
  if (!message) return "";
  if (Array.isArray(message.parts)) {
    return message.parts
      .filter((part) => part.type === "text" && part.text)
      .map((part) => part.text)
      .join("\n");
  }
  return message.text || "";
}

function getUserText(message) {
  if (!message) return "";
  let text = message.text || "";
  // Strip the "[Attached files/images: ...]" prefix the runtime adds.
  const attachedMatch = text.match(/^\[Attached (?:files|images):\n?[^\]]*\]\n*/s);
  if (attachedMatch) text = text.slice(attachedMatch[0].length);
  return text.trim();
}

export default function QuickQWindow() {
  const {
    getConversation,
    prepareMessage,
    startPreparedMessage,
    cancelMessage,
    replaceMessages,
  } = useAgent();
  const [quickState, setQuickState] = useState(null);
  const [conversationId, setConversationId] = useState("");
  const [input, setInput] = useState("");
  const [nativeSessionId, setNativeSessionId] = useState("");
  const [localError, setLocalError] = useState("");
  const textareaRef = useRef(null);
  const scrollRef = useRef(null);
  const containerRef = useRef(null);
  const lastSentHeightRef = useRef(MIN_PANEL_HEIGHT);

  const conversation = getConversation(conversationId);
  const messages = useMemo(() => conversation?.messages || [], [conversation?.messages]);
  const hasMessages = messages.length > 0;
  const runtime = quickState?.runtime;
  const isStreaming = Boolean(conversation?.isStreaming);
  const canSend = Boolean(input.trim()) && Boolean(conversationId) && !isStreaming && Boolean(runtime?.available);
  const placeholder = localError || conversation?.error || runtime?.unavailableReason || "Ask anything";

  const applyQuickState = useCallback((state) => {
    if (!state?.conversationId) return;
    setQuickState(state);
    setConversationId(state.conversationId);
    setInput("");
    setNativeSessionId("");
    setLocalError("");
    replaceMessages(state.conversationId, []);
  }, [replaceMessages]);

  useEffect(() => {
    window.api?.quickQState?.().then(applyQuickState).catch(() => {});
    const offReset = window.api?.onQuickQReset?.(applyQuickState);
    const offAppearance = window.api?.onQuickQAppearance?.((appearance) => {
      setQuickState((prev) => prev ? { ...prev, appearance } : prev);
    });
    return () => {
      offReset?.();
      offAppearance?.();
    };
  }, [applyQuickState]);

  useEffect(() => {
    if (!conversationId) return undefined;
    const offStream = window.api?.onAgentStream?.(({ conversationId: id, event }) => {
      if (id !== conversationId) return;
      const nextSessionId = extractNativeSessionId(event);
      if (nextSessionId) setNativeSessionId(nextSessionId);
    });
    const offDone = window.api?.onAgentDone?.(({ conversationId: id, threadId }) => {
      if (id !== conversationId) return;
      if (threadId) setNativeSessionId(threadId);
      window.setTimeout(() => textareaRef.current?.focus(), 30);
    });
    const offError = window.api?.onAgentError?.(({ conversationId: id, error }) => {
      if (id !== conversationId) return;
      if (error) setLocalError(String(error));
    });
    return () => {
      offStream?.();
      offDone?.();
      offError?.();
    };
  }, [conversationId]);

  useEffect(() => {
    const timer = window.setTimeout(() => textareaRef.current?.focus(), 40);
    return () => window.clearTimeout(timer);
  }, [conversationId]);

  // Keep the answer area pinned to the bottom while streaming so users see
  // tokens land without manually scrolling.
  useEffect(() => {
    if (!isStreaming || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [isStreaming, messages]);

  // Grow / shrink the Electron window to match the rendered panel height. We
  // observe the panel's content height and forward it to the main process,
  // which clamps it inside its own min/max bounds.
  useEffect(() => {
    const node = containerRef.current;
    if (!node || !window.api?.quickQResize) return undefined;

    const requestHeight = () => {
      // 10px outer padding (5 each side) + a little breathing room, capped.
      const desired = Math.ceil(node.scrollHeight) + 10;
      const clamped = Math.min(MAX_PANEL_HEIGHT, Math.max(MIN_PANEL_HEIGHT, desired));
      if (Math.abs(clamped - lastSentHeightRef.current) < 2) return;
      lastSentHeightRef.current = clamped;
      window.api.quickQResize(clamped);
    };

    requestHeight();
    const observer = new ResizeObserver(requestHeight);
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMessages, conversationId]);

  const handleSend = useCallback(() => {
    const prompt = input.trim();
    if (!prompt || !conversationId || !runtime?.available || isStreaming) return;

    const provider = runtime.provider || "claude";
    const resumeSessionId = nativeSessionId || undefined;
    const initialSessionId = !resumeSessionId && provider === "claude" ? uid() : undefined;
    if (initialSessionId) setNativeSessionId(initialSessionId);

    const pendingId = prepareMessage({ conversationId, prompt });

    startPreparedMessage({
      conversationId,
      pendingId,
      sessionId: initialSessionId,
      resumeSessionId,
      prompt,
      model: runtime.cliFlag,
      provider,
      effort: runtime.effort,
      thinking: getRuntimeThinking(runtime),
      openCodeConfig: getOpenCodeRuntimeConfig(runtime),
      cwd: quickState?.cwd,
      projectContext: "",
    });

    setInput("");
    setLocalError("");
  }, [
    conversationId,
    input,
    isStreaming,
    nativeSessionId,
    prepareMessage,
    quickState?.cwd,
    runtime,
    startPreparedMessage,
  ]);

  const handleReset = useCallback(() => {
    if (!conversationId) return;
    if (isStreaming) cancelMessage(conversationId);
    replaceMessages(conversationId, []);
    setNativeSessionId("");
    setLocalError("");
    setInput("");
    window.setTimeout(() => textareaRef.current?.focus(), 30);
  }, [cancelMessage, conversationId, isStreaming, replaceMessages]);

  const handleKeyDown = useCallback((event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const appearance = quickState?.appearance || {};
  const panelBlur = 22 + (Number(appearance.appBlur) || 0);
  const runtimeLabel = runtime?.displayLabel || (runtime?.label && `${runtime.label}`) || "Quick Q";

  // Build a flat list of [user, assistant] turns for rendering.
  const turns = useMemo(() => {
    const result = [];
    for (let i = 0; i < messages.length; i += 1) {
      const msg = messages[i];
      if (msg.role === "user") {
        const next = messages[i + 1];
        const assistant = next && next.role === "assistant" ? next : null;
        result.push({ user: msg, assistant });
        if (assistant) i += 1;
      } else if (msg.role === "assistant") {
        result.push({ user: null, assistant: msg });
      }
    }
    return result;
  }, [messages]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100vw",
        padding: 5,
        boxSizing: "border-box",
        background: "transparent",
        color: "rgba(255,255,255,0.9)",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          borderRadius: PANEL_RADIUS,
          border: `1px solid ${PANEL_BORDER}`,
          background: PANEL_BG,
          boxShadow: "0 22px 60px rgba(0,0,0,0.48), inset 0 1px 0 rgba(255,255,255,0.06)",
          backdropFilter: `blur(${panelBlur}px) saturate(1.2)`,
          WebkitBackdropFilter: `blur(${panelBlur}px) saturate(1.2)`,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxSizing: "border-box",
        }}
      >
        {/* Input row — always visible, drags the window */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 10px 10px 16px",
            height: HEADER_HEIGHT,
            flexShrink: 0,
            WebkitAppRegion: "drag",
          }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            spellCheck={false}
            rows={1}
            disabled={!runtime?.available}
            style={{
              flex: 1,
              minWidth: 0,
              height: 40,
              border: 0,
              resize: "none",
              outline: "none",
              overflowY: "auto",
              background: "transparent",
              color: "rgba(255,255,255,0.92)",
              caretColor: "rgb(150, 190, 255)",
              fontFamily: "inherit",
              fontSize: 14,
              lineHeight: "20px",
              padding: "10px 0",
              boxSizing: "border-box",
              WebkitAppRegion: "no-drag",
            }}
          />
          {hasMessages && (
            <button
              type="button"
              title="New question"
              aria-label="New question"
              onClick={handleReset}
              style={{
                width: 30,
                height: 30,
                flexShrink: 0,
                borderRadius: "50%",
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.04)",
                color: "rgba(255,255,255,0.62)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                WebkitAppRegion: "no-drag",
              }}
            >
              <Plus size={15} strokeWidth={2} />
            </button>
          )}
          <button
            type="button"
            title={isStreaming ? "Stop" : "Send"}
            aria-label={isStreaming ? "Stop" : "Send"}
            onClick={isStreaming ? () => cancelMessage(conversationId) : handleSend}
            disabled={!isStreaming && !canSend}
            style={{
              width: 36,
              height: 36,
              flexShrink: 0,
              borderRadius: "50%",
              border: 0,
              background: (isStreaming || canSend) ? "rgb(150, 190, 255)" : "rgba(150, 190, 255, 0.32)",
              color: "rgb(8, 13, 17)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: (isStreaming || canSend) ? "pointer" : "default",
              transition: "background .15s ease",
              WebkitAppRegion: "no-drag",
            }}
          >
            {isStreaming
              ? <span style={{ width: 11, height: 11, background: "rgb(8, 13, 17)", borderRadius: 2, display: "block" }} />
              : <ArrowUp size={18} strokeWidth={2.4} />}
          </button>
        </div>

        {/* Answer area — only mounted when there are turns to show */}
        {hasMessages && (
          <>
            <div
              style={{
                height: 1,
                background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.10), transparent)",
                flexShrink: 0,
              }}
            />
            <div
              ref={scrollRef}
              className="quick-q-scroll"
              style={{
                maxHeight: 460,
                overflowY: "auto",
                padding: "14px 18px 16px",
                fontSize: 13.5,
                lineHeight: 1.65,
                color: "rgba(255,255,255,0.78)",
              }}
            >
              {turns.map((turn, index) => {
                const userText = getUserText(turn.user);
                const assistantText = getAssistantText(turn.assistant);
                const turnIsStreaming = Boolean(turn.assistant?.isStreaming);
                const turnIsThinking = Boolean(turn.assistant?.isThinking);

                return (
                  <div key={turn.user?.id || turn.assistant?.id || index} style={{ marginBottom: index === turns.length - 1 ? 4 : 18 }}>
                    {userText && (
                      <div
                        style={{
                          color: "rgba(255,255,255,0.55)",
                          fontSize: 12,
                          lineHeight: 1.55,
                          marginBottom: 8,
                          whiteSpace: "pre-wrap",
                          overflowWrap: "anywhere",
                        }}
                      >
                        <span style={{
                          fontFamily: "'JetBrains Mono','SF Mono',Menlo,monospace",
                          fontSize: 9.5,
                          letterSpacing: ".14em",
                          color: "rgba(255,255,255,0.32)",
                          marginRight: 8,
                          textTransform: "uppercase",
                        }}>You</span>
                        {userText}
                      </div>
                    )}

                    {(assistantText || turnIsThinking || turnIsStreaming) && (
                      <div style={{ color: "rgba(255,255,255,0.86)" }}>
                        {assistantText ? (
                          <Markdown
                            remarkPlugins={[remarkGfm, remarkMath]}
                            rehypePlugins={[rehypeKatex]}
                            components={MARKDOWN_COMPONENTS}
                          >
                            {assistantText}
                          </Markdown>
                        ) : null}
                        {(turnIsStreaming || turnIsThinking) && !assistantText && (
                          <div
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              color: "rgba(255,255,255,0.45)",
                              fontSize: 12,
                            }}
                          >
                            <Loader2 size={12} style={{ animation: "quickQspin 1s linear infinite" }} />
                            <span>{turnIsThinking ? "Thinking…" : "Working…"}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {conversation?.error && !isStreaming && (
                <div
                  style={{
                    marginTop: 6,
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid rgba(255,140,140,0.18)",
                    background: "rgba(255,90,90,0.06)",
                    color: "rgba(255,180,180,0.82)",
                    fontSize: 12,
                  }}
                >
                  {String(conversation.error)}
                </div>
              )}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "6px 14px 8px",
                borderTop: "1px solid rgba(255,255,255,0.05)",
                fontSize: 10.5,
                fontFamily: "'JetBrains Mono','SF Mono',Menlo,monospace",
                color: "rgba(255,255,255,0.34)",
                letterSpacing: ".06em",
                flexShrink: 0,
                WebkitAppRegion: "drag",
              }}
            >
              <span style={{ textTransform: "uppercase" }}>{runtimeLabel}</span>
              <button
                type="button"
                title="Close (Esc)"
                aria-label="Close"
                onClick={() => window.api?.quickQClose?.()}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  background: "transparent",
                  border: 0,
                  color: "rgba(255,255,255,0.34)",
                  cursor: "pointer",
                  padding: "2px 4px",
                  fontFamily: "inherit",
                  fontSize: "inherit",
                  letterSpacing: "inherit",
                  textTransform: "uppercase",
                  WebkitAppRegion: "no-drag",
                }}
                onMouseEnter={(event) => { event.currentTarget.style.color = "rgba(255,255,255,0.7)"; }}
                onMouseLeave={(event) => { event.currentTarget.style.color = "rgba(255,255,255,0.34)"; }}
              >
                <X size={11} strokeWidth={2} />
                Esc
              </button>
            </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes quickQspin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        textarea::placeholder {
          color: rgba(255,255,255,0.42);
        }
        .quick-q-scroll::-webkit-scrollbar {
          width: 6px;
        }
        .quick-q-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .quick-q-scroll::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.08);
          border-radius: 3px;
        }
        .quick-q-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(255,255,255,0.16);
        }
      `}</style>
    </div>
  );
}
