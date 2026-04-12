import { useState, useCallback, useEffect, useRef } from "react";

let _msgId = 0;
const uid = () => "m" + (++_msgId) + "-" + Date.now();

// Helper: deep-clone parts array (each part is a new object)
function cloneParts(parts) {
  return (parts || []).map(p => ({ ...p }));
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
            const parts = cloneParts(am.parts);
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
            const parts = cloneParts(am.parts);
            const delta = inner.delta;
            if (delta?.type === "text_delta") {
              // Find or create last text part — parts are already cloned so safe to update
              const lastIdx = parts.length - 1;
              if (lastIdx >= 0 && parts[lastIdx].type === "text") {
                parts[lastIdx] = { ...parts[lastIdx], text: parts[lastIdx].text + (delta.text || "") };
              } else {
                parts.push({ type: "text", text: delta.text || "" });
              }
              msgs[msgs.length - 1] = { ...am, parts, isThinking: false };
            } else if (delta?.type === "input_json_delta") {
              // Find the last tool part — parts already cloned
              for (let i = parts.length - 1; i >= 0; i--) {
                if (parts[i].type === "tool") {
                  const newJson = (parts[i].argsJson || "") + (delta.partial_json || "");
                  let newArgs = parts[i].args;
                  try { newArgs = JSON.parse(newJson); } catch {}
                  parts[i] = { ...parts[i], argsJson: newJson, args: newArgs };
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
          // With --include-partial-messages, assistant events contain full accumulated text.
          // Only use these if we have NO stream_event parts yet (fallback for non-streaming).
          const am = ensureAssistant();
          const parts = cloneParts(am.parts);
          const hasStreamParts = parts.length > 0;
          if (!hasStreamParts && event.message?.content) {
            for (const block of event.message.content) {
              if (block.type === "text" && block.text) {
                parts.push({ type: "text", text: block.text });
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
            msgs[msgs.length - 1] = { ...am, parts, isThinking: false };
          }
        } else if (event.type === "user") {
          if (event.message?.content) {
            for (const block of event.message.content) {
              if (block.type === "tool_result" && block.tool_use_id) {
                for (let mi = msgs.length - 1; mi >= 0; mi--) {
                  if (msgs[mi].role === "assistant" && msgs[mi].parts) {
                    const parts = cloneParts(msgs[mi].parts);
                    const tpIdx = parts.findIndex(p => p.type === "tool" && p.id === block.tool_use_id);
                    if (tpIdx >= 0) {
                      parts[tpIdx] = { ...parts[tpIdx], result: block.content, status: "done" };
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
            if (event.is_error || event.subtype === "error_during_execution") {
              // Surface the error as text in the assistant message
              const errorText = event.result || event.error
                || (event.errors && event.errors.length > 0 ? event.errors.join("\n") : null)
                || "An error occurred.";
              const parts = cloneParts(lastMsg.parts);
              parts.push({ type: "text", text: `**Error:** ${errorText}` });
              msgs[msgs.length - 1] = { ...lastMsg, parts, isStreaming: false, isThinking: false };
            } else {
              msgs[msgs.length - 1] = { ...lastMsg, isStreaming: false, isThinking: false };
            }
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
        // Surface error in the last assistant message
        const msgs = [...convo.messages];
        const lastMsg = msgs[msgs.length - 1];
        if (lastMsg && lastMsg.role === "assistant") {
          const parts = cloneParts(lastMsg.parts);
          parts.push({ type: "text", text: `**Error:** ${error}` });
          msgs[msgs.length - 1] = { ...lastMsg, parts, isStreaming: false, isThinking: false };
        }
        next.set(conversationId, { messages: msgs, error, isStreaming: false });
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
