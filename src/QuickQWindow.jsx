import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, ImageOff, Loader2, RefreshCw, Send, ShieldAlert, X } from "lucide-react";
import Message from "./components/Message";
import useAgent from "./hooks/useAgent";
import { loadOpenCodeState } from "./opencode/store";

const PANEL_BACKGROUND = "rgba(13, 13, 16, 0.94)";
const PANEL_BORDER = "rgba(255,255,255,0.10)";

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

function useAutofocus(ref, deps) {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      ref.current?.focus();
    }, 40);
    return () => window.clearTimeout(timer);
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}

function IconButton({ title, onClick, disabled = false, children }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 30,
        height: 30,
        borderRadius: 7,
        border: "1px solid rgba(255,255,255,0.08)",
        background: disabled ? "rgba(255,255,255,0.025)" : "rgba(255,255,255,0.055)",
        color: disabled ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.68)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: disabled ? "not-allowed" : "pointer",
        WebkitAppRegion: "no-drag",
      }}
    >
      {children}
    </button>
  );
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
  const [screenshotDataUrl, setScreenshotDataUrl] = useState(null);
  const [attachNextTurn, setAttachNextTurn] = useState(false);
  const [input, setInput] = useState("");
  const [retaking, setRetaking] = useState(false);
  const [nativeSessionId, setNativeSessionId] = useState("");
  const [localError, setLocalError] = useState("");
  const textareaRef = useRef(null);
  const scrollRef = useRef(null);

  const conversation = getConversation(conversationId);
  const runtime = quickState?.runtime;
  const isStreaming = Boolean(conversation?.isStreaming);
  const canSend = Boolean(input.trim()) && Boolean(conversationId) && !isStreaming && Boolean(runtime?.available);
  const captureDenied = quickState?.captureError === "screen-permission-denied";
  const captureError = quickState?.captureError && !captureDenied ? quickState.captureError : "";

  const applyQuickState = useCallback((state) => {
    if (!state?.conversationId) return;
    setQuickState(state);
    setConversationId(state.conversationId);
    setScreenshotDataUrl(state.screenshotDataUrl || null);
    setAttachNextTurn(Boolean(state.screenshotDataUrl));
    setInput("");
    setNativeSessionId("");
    setLocalError("");
    replaceMessages(state.conversationId, []);
  }, [replaceMessages]);

  useEffect(() => {
    window.api?.quickQState?.().then(applyQuickState).catch(() => {});
    const offReset = window.api?.onQuickQReset?.(applyQuickState);
    return () => offReset?.();
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
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [conversation?.messages, conversation?.isStreaming]);

  useAutofocus(textareaRef, [conversationId]);

  const handleClose = useCallback(() => {
    if (conversationId) cancelMessage(conversationId);
    window.api?.quickQClose?.();
  }, [cancelMessage, conversationId]);

  const handleRetake = useCallback(async () => {
    if (!window.api?.quickQRetakeScreenshot) return;
    setRetaking(true);
    setLocalError("");
    try {
      const capture = await window.api.quickQRetakeScreenshot();
      setQuickState((prev) => ({
        ...prev,
        screenshotDataUrl: capture?.screenshotDataUrl || null,
        captureError: capture?.captureError || "",
        permissionStatus: capture?.permissionStatus || prev?.permissionStatus || "unknown",
      }));
      setScreenshotDataUrl(capture?.screenshotDataUrl || null);
      setAttachNextTurn(Boolean(capture?.screenshotDataUrl));
    } catch (error) {
      setLocalError(error?.message || "Failed to capture screenshot.");
    } finally {
      setRetaking(false);
      window.setTimeout(() => textareaRef.current?.focus(), 30);
    }
  }, []);

  const handleSend = useCallback(() => {
    const prompt = input.trim();
    if (!prompt || !conversationId || !runtime?.available || isStreaming) return;

    const imageForTurn = screenshotDataUrl && attachNextTurn ? screenshotDataUrl : null;
    const displayImages = imageForTurn
      ? [{ dataUrl: imageForTurn, name: "Quick Q screenshot", mime: "image/png" }]
      : undefined;
    const wireImages = imageForTurn ? [imageForTurn] : undefined;
    const provider = runtime.provider || "claude";
    const resumeSessionId = nativeSessionId || undefined;
    const initialSessionId = !resumeSessionId && provider === "claude" ? uid() : undefined;
    if (initialSessionId) setNativeSessionId(initialSessionId);

    const pendingId = prepareMessage({
      conversationId,
      prompt,
      images: displayImages,
    });

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
      images: wireImages,
    });

    setInput("");
    if (imageForTurn) setAttachNextTurn(false);
    setLocalError("");
  }, [
    attachNextTurn,
    conversationId,
    input,
    isStreaming,
    nativeSessionId,
    prepareMessage,
    quickState?.cwd,
    runtime,
    screenshotDataUrl,
    startPreparedMessage,
  ]);

  const handleKeyDown = useCallback((event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const messages = useMemo(() => conversation?.messages || [], [conversation?.messages]);

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        padding: 8,
        boxSizing: "border-box",
        background: "transparent",
        color: "rgba(255,255,255,0.86)",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          borderRadius: 16,
          border: `1px solid ${PANEL_BORDER}`,
          background: PANEL_BACKGROUND,
          boxShadow: "0 22px 80px rgba(0,0,0,0.52), inset 0 1px 0 rgba(255,255,255,0.07)",
          backdropFilter: "blur(26px) saturate(1.2)",
          WebkitBackdropFilter: "blur(26px) saturate(1.2)",
        }}
      >
        <header
          style={{
            height: 40,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "0 10px 0 14px",
            WebkitAppRegion: "drag",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10,
                letterSpacing: ".12em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.44)",
                whiteSpace: "nowrap",
              }}
            >
              Quick Q
            </div>
            <div
              title={runtime?.displayLabel || ""}
              style={{
                fontSize: 11,
                color: runtime?.available ? "rgba(205,235,255,0.62)" : "rgba(255,190,150,0.72)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: 390,
              }}
            >
              {runtime?.displayLabel || "Preparing runtime"}
            </div>
          </div>
          <IconButton title="Close" onClick={handleClose}>
            <X size={15} strokeWidth={1.8} />
          </IconButton>
        </header>

        <section
          style={{
            flexShrink: 0,
            padding: "10px 12px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            display: "flex",
            gap: 10,
            alignItems: "stretch",
            minHeight: 86,
          }}
        >
          {screenshotDataUrl ? (
            <div
              style={{
                width: 130,
                height: 72,
                borderRadius: 8,
                overflow: "hidden",
                border: attachNextTurn
                  ? "1px solid rgba(180,220,255,0.36)"
                  : "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.04)",
                flexShrink: 0,
              }}
            >
              <img
                src={screenshotDataUrl}
                alt="Current screenshot"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                }}
              />
            </div>
          ) : (
            <div
              style={{
                width: 130,
                height: 72,
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(255,255,255,0.035)",
                color: "rgba(255,255,255,0.22)",
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
              }}
            >
              <ImageOff size={24} strokeWidth={1.4} />
            </div>
          )}

          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            {(captureDenied || captureError) ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  color: captureDenied ? "rgba(255,210,160,0.85)" : "rgba(255,180,170,0.82)",
                  fontSize: 12,
                  lineHeight: 1.4,
                  minWidth: 0,
                }}
              >
                <ShieldAlert size={16} strokeWidth={1.7} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>
                  {captureDenied
                    ? "RayLine needs Screen Recording permission."
                    : `Capture failed: ${captureError}`}
                </span>
              </div>
            ) : (
              <div
                style={{
                  fontSize: 12,
                  color: attachNextTurn ? "rgba(205,235,255,0.72)" : "rgba(255,255,255,0.42)",
                  lineHeight: 1.35,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                }}
              >
                {attachNextTurn ? "Screenshot will be attached to the next turn." : "Screenshot kept for reference."}
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
              {captureDenied && (
                <button
                  type="button"
                  onClick={() => window.api?.quickQOpenScreenSettings?.()}
                  style={{
                    height: 28,
                    padding: "0 10px",
                    borderRadius: 7,
                    border: "1px solid rgba(255,210,160,0.18)",
                    background: "rgba(255,210,160,0.08)",
                    color: "rgba(255,230,200,0.86)",
                    fontSize: 11,
                    cursor: "pointer",
                  }}
                >
                  Open Settings
                </button>
              )}
              <IconButton title="Retake screenshot" onClick={handleRetake} disabled={retaking}>
                {retaking
                  ? <Loader2 size={14} strokeWidth={1.7} style={{ animation: "spin 1s linear infinite" }} />
                  : <RefreshCw size={14} strokeWidth={1.7} />}
              </IconButton>
              <IconButton
                title={attachNextTurn ? "Do not attach next turn" : "Attach screenshot next turn"}
                onClick={() => setAttachNextTurn((value) => !value)}
                disabled={!screenshotDataUrl}
              >
                <Camera size={14} strokeWidth={1.7} />
              </IconButton>
              <IconButton
                title="Remove screenshot"
                onClick={() => {
                  setScreenshotDataUrl(null);
                  setAttachNextTurn(false);
                }}
                disabled={!screenshotDataUrl}
              >
                <ImageOff size={14} strokeWidth={1.7} />
              </IconButton>
            </div>
          </div>
        </section>

        <main
          ref={scrollRef}
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            padding: messages.length > 0 ? "0 16px" : "18px 16px",
          }}
        >
          {messages.length === 0 ? (
            <div
              style={{
                height: "100%",
                display: "grid",
                placeItems: "center",
                color: "rgba(255,255,255,0.28)",
                fontSize: 13,
                textAlign: "center",
              }}
            >
              <span>Ask about the current screen.</span>
            </div>
          ) : (
            messages.map((message, index) => (
              <Message
                key={message.id || index}
                msg={message}
                modelId={runtime?.id || runtime?.cliFlag || "sonnet"}
                messageIndex={index}
                canEdit={false}
              />
            ))
          )}
        </main>

        {(localError || conversation?.error) && (
          <div
            style={{
              flexShrink: 0,
              padding: "8px 12px",
              borderTop: "1px solid rgba(255,180,160,0.12)",
              color: "rgba(255,185,165,0.82)",
              fontSize: 11,
              lineHeight: 1.35,
              background: "rgba(255,80,50,0.045)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={localError || conversation?.error || ""}
          >
            {localError || conversation?.error}
          </div>
        )}

        <footer
          style={{
            flexShrink: 0,
            padding: "10px 12px 12px",
            borderTop: "1px solid rgba(255,255,255,0.06)",
            background: "rgba(0,0,0,0.10)",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) 34px",
              gap: 8,
              alignItems: "end",
            }}
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={runtime?.available ? "Ask a quick question..." : runtime?.unavailableReason || "Runtime unavailable"}
              disabled={!runtime?.available}
              rows={2}
              style={{
                width: "100%",
                minHeight: 48,
                maxHeight: 110,
                resize: "vertical",
                boxSizing: "border-box",
                borderRadius: 9,
                border: "1px solid rgba(255,255,255,0.09)",
                background: "rgba(255,255,255,0.045)",
                color: "rgba(255,255,255,0.9)",
                padding: "10px 11px",
                fontFamily: "'Newsreader','Iowan Old Style',Georgia,serif",
                fontSize: 15,
                lineHeight: 1.35,
              }}
            />
            <button
              type="button"
              aria-label={isStreaming ? "Running" : "Send"}
              title={isStreaming ? "Running" : "Send"}
              onClick={handleSend}
              disabled={!canSend}
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                border: canSend ? "1px solid rgba(205,235,255,0.26)" : "1px solid rgba(255,255,255,0.08)",
                background: canSend ? "rgba(205,235,255,0.18)" : "rgba(255,255,255,0.035)",
                color: canSend ? "rgba(235,248,255,0.94)" : "rgba(255,255,255,0.28)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: canSend ? "pointer" : "not-allowed",
              }}
            >
              {isStreaming
                ? <Loader2 size={15} strokeWidth={1.8} style={{ animation: "spin 1s linear infinite" }} />
                : <Send size={15} strokeWidth={1.8} />}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
