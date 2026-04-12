import { useState, useCallback, useEffect, useRef } from "react";

let _msgId = 0;
const uid = () => "m" + (++_msgId) + "-" + Date.now();

// Helper: get or create the last text part on an assistant message
function lastTextPart(parts) {
  const last = parts[parts.length - 1];
  if (last && last.type === "text") return last;
  const p = { type: "text", text: "" };
  parts.push(p);
  return p;
}

// Helper: find a tool part by id across all parts
function findToolPart(parts, toolId) {
  for (const p of parts) {
    if (p.type === "tool" && p.id === toolId) return p;
  }
  return null;
}

export default function useAgent() {
  const [conversations, setConversations] = useState(new Map());
  const cleanupRefs = useRef([]);

  useEffect(() => {
    if (!window.api) return;

    const offStream = window.api.onAgentStream(({ conversationId, event }) => {
      setConversations((prev) => {
        const next = new Map(prev);
        const convo = next.get(conversationId) || { messages: [], isStreaming: true, error: null };
        const msgs = [...convo.messages];
        let lastMsg = msgs[msgs.length - 1];

        const ensureAssistant = () => {
          if (!lastMsg || lastMsg.role !== "assistant") {
            lastMsg = { id: uid(), role: "assistant", parts: [], isStreaming: true, isThinking: false };
            msgs.push(lastMsg);
          }
          return lastMsg;
        };

        if (event.type === "stream_event") {
          const inner = event.event;
          if (!inner) { next.set(conversationId, { ...convo, messages: msgs }); return next; }

          if (inner.type === "content_block_start") {
            const block = inner.content_block;
            const am = ensureAssistant();
            const parts = [...(am.parts || [])];
            if (block?.type === "thinking") {
              msgs[msgs.length - 1] = { ...am, parts, isThinking: true };
            } else if (block?.type === "tool_use") {
              parts.push({
                type: "tool",
                id: block.id || "tc" + uid(),
                name: block.name || "unknown",
                args: {},
                argsJson: "",
                result: null,
                status: "running",
              });
              msgs[msgs.length - 1] = { ...am, parts, isThinking: false };
            } else if (block?.type === "text") {
              // Start a new text part (don't merge with previous text that was before tool calls)
              parts.push({ type: "text", text: "" });
              msgs[msgs.length - 1] = { ...am, parts, isThinking: false };
            }
          } else if (inner.type === "content_block_delta") {
            const am = ensureAssistant();
            const parts = [...(am.parts || [])];
            const delta = inner.delta;
            if (delta?.type === "text_delta") {
              const tp = lastTextPart(parts);
              tp.text += (delta.text || "");
              msgs[msgs.length - 1] = { ...am, parts, isThinking: false };
            } else if (delta?.type === "input_json_delta") {
              // Find the last tool part
              for (let i = parts.length - 1; i >= 0; i--) {
                if (parts[i].type === "tool") {
                  parts[i] = { ...parts[i] };
                  parts[i].argsJson = (parts[i].argsJson || "") + (delta.partial_json || "");
                  try { parts[i].args = JSON.parse(parts[i].argsJson); } catch {}
                  break;
                }
              }
              msgs[msgs.length - 1] = { ...am, parts };
            } else if (delta?.type === "thinking_delta") {
              msgs[msgs.length - 1] = { ...am, isThinking: true };
            }
          } else if (inner.type === "content_block_stop") {
            const am = ensureAssistant();
            msgs[msgs.length - 1] = { ...am, isThinking: false };
          }
        } else if (event.type === "assistant") {
          const am = ensureAssistant();
          const parts = [...(am.parts || [])];
          if (event.message?.content) {
            for (const block of event.message.content) {
              if (block.type === "text" && block.text) {
                // Check if we should update the last text part or add new
                const lastPart = parts[parts.length - 1];
                if (lastPart && lastPart.type === "text") {
                  lastPart.text = block.text; // replace (full message update)
                } else {
                  parts.push({ type: "text", text: block.text });
                }
              }
              if (block.type === "tool_use") {
                if (!findToolPart(parts, block.id)) {
                  parts.push({
                    type: "tool",
                    id: block.id,
                    name: block.name || "unknown",
                    args: block.input || {},
                    result: null,
                    status: "running",
                  });
                }
              }
            }
          }
          msgs[msgs.length - 1] = { ...am, parts, isThinking: false };
        } else if (event.type === "user") {
          if (event.message?.content) {
            for (const block of event.message.content) {
              if (block.type === "tool_result" && block.tool_use_id) {
                for (let mi = msgs.length - 1; mi >= 0; mi--) {
                  if (msgs[mi].role === "assistant" && msgs[mi].parts) {
                    const parts = [...msgs[mi].parts];
                    const tp = findToolPart(parts, block.tool_use_id);
                    if (tp) {
                      tp.result = block.content;
                      tp.status = "done";
                      msgs[mi] = { ...msgs[mi], parts };
                      break;
                    }
                  }
                }
              }
            }
          }
        } else if (event.type === "result") {
          if (lastMsg && lastMsg.role === "assistant") {
            msgs[msgs.length - 1] = { ...lastMsg, isStreaming: false, isThinking: false };
          }
        }

        next.set(conversationId, { ...convo, messages: msgs });
        return next;
      });
    });

    const offDone = window.api.onAgentDone(({ conversationId }) => {
      setConversations((prev) => {
        const next = new Map(prev);
        const convo = next.get(conversationId);
        if (convo) {
          const msgs = convo.messages.map((m) =>
            m.role === "assistant" ? { ...m, isStreaming: false, isThinking: false } : m
          );
          next.set(conversationId, { ...convo, messages: msgs, isStreaming: false });
        }
        return next;
      });
    });

    const offError = window.api.onAgentError(({ conversationId, error }) => {
      setConversations((prev) => {
        const next = new Map(prev);
        const convo = next.get(conversationId) || { messages: [], isStreaming: false, error: null };
        next.set(conversationId, { ...convo, error, isStreaming: false });
        return next;
      });
    });

    cleanupRefs.current = [offStream, offDone, offError];
    return () => cleanupRefs.current.forEach((fn) => fn?.());
  }, []);

  const sendMessage = useCallback(({ conversationId, sessionId, prompt, model, cwd, images, files, resumeSessionId, forkSession }) => {
    setConversations((prev) => {
      const next = new Map(prev);
      const convo = next.get(conversationId) || { messages: [], isStreaming: false, error: null };
      const msgs = [
        ...convo.messages,
        { id: uid(), role: "user", text: prompt, images, files },
        { id: uid(), role: "assistant", parts: [], isStreaming: true, isThinking: true },
      ];
      next.set(conversationId, { messages: msgs, isStreaming: true, error: null });
      return next;
    });

    if (window.api) {
      window.api.agentStart({ conversationId, sessionId, prompt, model, cwd, images, files, resumeSessionId, forkSession });
    }
  }, []);

  const cancelMessage = useCallback((conversationId) => {
    if (window.api) {
      window.api.agentCancel({ conversationId });
    }
  }, []);

  const editAndResend = useCallback(({ conversationId, sessionId, messageIndex, newText, model, cwd }) => {
    setConversations((prev) => {
      const next = new Map(prev);
      const convo = next.get(conversationId);
      if (convo) {
        const msgs = convo.messages.slice(0, messageIndex);
        msgs.push({ id: uid(), role: "user", text: newText });
        next.set(conversationId, { messages: msgs, isStreaming: true, error: null });
      }
      return next;
    });

    if (window.api) {
      window.api.agentEditAndResend({
        conversationId,
        resumeSessionId: sessionId,
        forkSession: true,
        prompt: newText,
        model,
        cwd,
      });
    }
  }, []);

  const loadMessages = useCallback((conversationId, messages) => {
    setConversations((prev) => {
      const next = new Map(prev);
      const existing = next.get(conversationId);
      if (!existing || existing.messages.length === 0) {
        next.set(conversationId, { messages, isStreaming: false, error: null });
      }
      return next;
    });
  }, []);

  const getConversation = useCallback((id) => {
    return conversations.get(id) || { messages: [], isStreaming: false, error: null };
  }, [conversations]);

  return { conversations, getConversation, sendMessage, cancelMessage, editAndResend, loadMessages };
}
