import { useState, useCallback, useEffect, useRef } from "react";

let _msgId = 0;
const uid = () => "m" + (++_msgId) + "-" + Date.now();

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

        // Ensure an assistant message exists
        const ensureAssistant = () => {
          if (!lastMsg || lastMsg.role !== "assistant") {
            lastMsg = { id: uid(), role: "assistant", text: "", toolCalls: [], isStreaming: true, isThinking: false };
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
            if (block?.type === "thinking") {
              msgs[msgs.length - 1] = { ...am, isThinking: true };
            } else if (block?.type === "tool_use") {
              const toolCalls = [...(am.toolCalls || [])];
              toolCalls.push({
                id: block.id || "tc" + uid(),
                name: block.name || "unknown",
                args: {},
                argsJson: "",
                result: null,
                status: "running",
              });
              msgs[msgs.length - 1] = { ...am, toolCalls, isThinking: false };
            } else if (block?.type === "text") {
              msgs[msgs.length - 1] = { ...am, isThinking: false };
            }
          } else if (inner.type === "content_block_delta") {
            const am = ensureAssistant();
            const delta = inner.delta;
            if (delta?.type === "text_delta") {
              msgs[msgs.length - 1] = { ...am, text: am.text + (delta.text || ""), isThinking: false };
            } else if (delta?.type === "input_json_delta") {
              // Tool call args streaming
              const toolCalls = [...(am.toolCalls || [])];
              if (toolCalls.length > 0) {
                const last = { ...toolCalls[toolCalls.length - 1] };
                last.argsJson = (last.argsJson || "") + (delta.partial_json || "");
                try { last.args = JSON.parse(last.argsJson); } catch {}
                toolCalls[toolCalls.length - 1] = last;
              }
              msgs[msgs.length - 1] = { ...am, toolCalls };
            } else if (delta?.type === "thinking_delta") {
              // Thinking — just keep the indicator
              msgs[msgs.length - 1] = { ...am, isThinking: true };
            }
          } else if (inner.type === "content_block_stop") {
            const am = ensureAssistant();
            msgs[msgs.length - 1] = { ...am, isThinking: false };
          }
        } else if (event.type === "assistant") {
          // Full assistant message — may contain tool_use or text
          const am = ensureAssistant();
          let text = "";
          const toolCalls = [...(am.toolCalls || [])];
          if (event.message?.content) {
            for (const block of event.message.content) {
              if (block.type === "text") text += block.text;
              if (block.type === "tool_use") {
                const existing = toolCalls.find(t => t.id === block.id);
                if (!existing) {
                  toolCalls.push({
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
          if (text) {
            msgs[msgs.length - 1] = { ...am, text, toolCalls, isThinking: false };
          } else if (toolCalls.length > am.toolCalls?.length) {
            msgs[msgs.length - 1] = { ...am, toolCalls, isThinking: false };
          }
        } else if (event.type === "user") {
          // Tool results come as user messages
          if (event.message?.content) {
            for (const block of event.message.content) {
              if (block.type === "tool_result" && block.tool_use_id) {
                // Find the assistant message with this tool call and mark it done
                for (let mi = msgs.length - 1; mi >= 0; mi--) {
                  if (msgs[mi].role === "assistant" && msgs[mi].toolCalls) {
                    const toolCalls = [...msgs[mi].toolCalls];
                    const idx = toolCalls.findIndex(t => t.id === block.tool_use_id);
                    if (idx >= 0) {
                      toolCalls[idx] = { ...toolCalls[idx], result: block.content, status: "done" };
                      msgs[mi] = { ...msgs[mi], toolCalls };
                      break;
                    }
                  }
                }
              }
            }
          }
        } else if (event.type === "tool_use" || event.type === "tool_call") {
          const am = ensureAssistant();
          const toolCalls = [...(am.toolCalls || [])];
          const subtype = event.subtype || "started";
          if (subtype === "started" || subtype === "pending") {
            toolCalls.push({
              id: event.callId || event.id || "tc" + uid(),
              name: event.toolName || event.name || "unknown",
              args: event.args || event.input || {},
              result: null,
              status: "running",
            });
          } else if (subtype === "completed") {
            const idx = toolCalls.findIndex((t) => t.id === (event.callId || event.id));
            if (idx >= 0) {
              toolCalls[idx] = { ...toolCalls[idx], result: event.result || event.output, status: "done" };
            }
          }
          msgs[msgs.length - 1] = { ...am, toolCalls };
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
        { id: uid(), role: "assistant", text: "", toolCalls: [], isStreaming: true, isThinking: true },
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
      // Only load if no messages in memory yet
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
