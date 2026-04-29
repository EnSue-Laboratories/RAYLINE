import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Loader2 } from "lucide-react";
import useAgent from "./hooks/useAgent";
import { loadOpenCodeState } from "./opencode/store";

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

  const conversation = getConversation(conversationId);
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

  useAutofocus(textareaRef, [conversationId]);

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

  const handleKeyDown = useCallback((event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const appearance = quickState?.appearance || {};
  const panelBlur = 22 + (Number(appearance.appBlur) || 0);

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        padding: 5,
        boxSizing: "border-box",
        background: "transparent",
        color: "rgba(255,255,255,0.9)",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          borderRadius: 24,
          border: "1px solid rgba(255,255,255,0.18)",
          background: "rgba(11, 14, 17, 0.88)",
          boxShadow: "0 18px 50px rgba(0,0,0,0.46), inset 0 1px 0 rgba(255,255,255,0.08)",
          backdropFilter: `blur(${panelBlur}px) saturate(1.15)`,
          WebkitBackdropFilter: `blur(${panelBlur}px) saturate(1.15)`,
          display: "flex",
          alignItems: "center",
          gap: 10,
          overflow: "hidden",
          padding: "10px 10px 10px 16px",
          boxSizing: "border-box",
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
            height: 46,
            border: 0,
            resize: "none",
            outline: "none",
            overflowY: "auto",
            background: "transparent",
            color: "rgba(255,255,255,0.9)",
            caretColor: "rgb(130, 176, 230)",
            fontFamily: "inherit",
            fontSize: 14,
            lineHeight: "22px",
            padding: "12px 0",
            boxSizing: "border-box",
            WebkitAppRegion: "no-drag",
          }}
        />
        <button
          type="button"
          title={isStreaming ? "Stop" : "Send"}
          aria-label={isStreaming ? "Stop" : "Send"}
          onClick={isStreaming ? () => cancelMessage(conversationId) : handleSend}
          disabled={!isStreaming && !canSend}
          style={{
            width: 38,
            height: 38,
            flexShrink: 0,
            borderRadius: "50%",
            border: 0,
            background: (isStreaming || canSend) ? "rgba(135, 170, 205, 0.70)" : "rgba(135, 170, 205, 0.38)",
            color: "rgba(8, 13, 17, 0.95)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: (isStreaming || canSend) ? "pointer" : "default",
            WebkitAppRegion: "no-drag",
          }}
        >
          {isStreaming
            ? <Loader2 size={19} strokeWidth={2} style={{ animation: "spin 1s linear infinite" }} />
            : <ArrowUp size={20} strokeWidth={2.25} />}
        </button>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        textarea::placeholder {
          color: rgba(255,255,255,0.48);
        }
      `}</style>
    </div>
  );
}
