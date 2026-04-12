import { useState, useCallback, useEffect, useRef } from "react";

let _msgId = 0;
const uid = () => "m" + (++_msgId) + "-" + Date.now();

// Helper: deep-clone parts array (each part is a new object)
function cloneParts(parts) {
  return (parts || []).map(p => ({ ...p }));
}

function findPartIndexByBlock(parts, blockIndex, type) {
  if (blockIndex == null) return -1;
  return parts.findIndex((p) => p.type === type && p.blockIndex === blockIndex);
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

          // Helper to update the last assistant message and keep lastMsg in sync
          const updateAssistant = (updates) => {
            const merged = { ...lastMsg, ...updates };
            msgs[msgs.length - 1] = merged;
            lastMsg = merged;
          };

          if (inner.type === "content_block_start") {
            const block = inner.content_block;
            ensureAssistant();
            const parts = cloneParts(lastMsg.parts);
            if (block?.type === "thinking") {
              const existingIdx = findPartIndexByBlock(parts, inner.index, "thinking");
              if (existingIdx >= 0) {
                parts[existingIdx] = { ...parts[existingIdx], type: "thinking" };
              } else {
                parts.push({ type: "thinking", text: "", blockIndex: inner.index });
              }
              updateAssistant({ parts, isThinking: true });
            } else if (block?.type === "tool_use") {
              parts.push({
                type: "tool",
                id: block.id || "tc" + uid(),
                name: block.name || "unknown",
                args: {},
                argsJson: "",
                result: null,
                status: "running",
                blockIndex: inner.index,
              });
              updateAssistant({ parts });
            } else if (block?.type === "text") {
              parts.push({ type: "text", text: "", blockIndex: inner.index });
              updateAssistant({ parts });
            }
          } else if (inner.type === "content_block_delta") {
            ensureAssistant();
            const parts = cloneParts(lastMsg.parts);
            const delta = inner.delta;
            if (delta?.type === "text_delta") {
              const textIdx = findPartIndexByBlock(parts, inner.index, "text");
              if (textIdx >= 0) {
                parts[textIdx] = { ...parts[textIdx], text: parts[textIdx].text + (delta.text || "") };
              } else {
                parts.push({ type: "text", text: delta.text || "", blockIndex: inner.index });
              }
              updateAssistant({ parts });
            } else if (delta?.type === "input_json_delta") {
              const toolIdx = findPartIndexByBlock(parts, inner.index, "tool");
              if (toolIdx >= 0) {
                const newJson = (parts[toolIdx].argsJson || "") + (delta.partial_json || "");
                let newArgs = parts[toolIdx].args;
                try { newArgs = JSON.parse(newJson); } catch {}
                parts[toolIdx] = { ...parts[toolIdx], argsJson: newJson, args: newArgs };
              }
              updateAssistant({ parts });
            } else if (delta?.type === "thinking_delta") {
              const thinkingIdx = findPartIndexByBlock(parts, inner.index, "thinking");
              if (thinkingIdx >= 0) {
                parts[thinkingIdx] = {
                  ...parts[thinkingIdx],
                  text: parts[thinkingIdx].text + (delta.thinking || ""),
                };
              } else {
                parts.push({ type: "thinking", text: delta.thinking || "", blockIndex: inner.index });
              }
              updateAssistant({ parts, isThinking: true });
            }
          } else if (inner.type === "content_block_stop") {
            ensureAssistant();
            // Only clear isThinking if the stopped block was a thinking block
            const stoppedIdx = inner.index;
            const wasThinking = lastMsg.parts?.some(p => p.type === "thinking" && p.blockIndex === stoppedIdx);
            if (wasThinking) {
              updateAssistant({ isThinking: false });
            }
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
