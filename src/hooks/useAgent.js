import { useState, useCallback, useEffect, useRef } from "react";

let _msgId = 0;
const uid = () => "m" + (++_msgId) + "-" + Date.now();

// Helper: deep-clone parts array (each part is a new object)
function cloneParts(parts) {
  return (parts || []).map(p => ({ ...p }));
}

function cloneStreamState(streamState) {
  const state = streamState || {};
  return {
    currentTurn: state.currentTurn || 0,
    seenIndexes: { ...(state.seenIndexes || {}) },
    activeBlocks: { ...(state.activeBlocks || {}) },
    activeThinking: { ...(state.activeThinking || {}) },
  };
}

// Freeze the final elapsed duration onto the assistant message when the
// stream ends. Once persisted, the loading indicator uses this value so it
// survives reloads (`Date.now() - _startedAt` would drift across sessions).
function freezeElapsed(msg) {
  if (!msg || msg.role !== "assistant") return msg;
  // Compaction is a transient mid-turn signal — never persist it past stream end.
  const { _compacting, ...rest } = msg;
  if (rest._elapsedMs != null) return rest;
  if (!rest._startedAt) return rest;
  return { ...rest, _elapsedMs: Date.now() - rest._startedAt };
}

function mergeUsage(prev, incoming) {
  if (!incoming) return prev || null;
  const base = prev || {};
  return {
    input_tokens: incoming.input_tokens ?? base.input_tokens ?? 0,
    output_tokens: incoming.output_tokens ?? base.output_tokens ?? 0,
    cache_creation_input_tokens:
      incoming.cache_creation_input_tokens ?? base.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens:
      incoming.cache_read_input_tokens ?? base.cache_read_input_tokens ?? 0,
    ...(Number.isFinite(incoming.total_tokens)
      ? { total_tokens: incoming.total_tokens }
      : Number.isFinite(base.total_tokens)
        ? { total_tokens: base.total_tokens }
        : {}),
    ...(Number.isFinite(incoming.context_window)
      ? { context_window: incoming.context_window }
      : Number.isFinite(base.context_window)
        ? { context_window: base.context_window }
        : {}),
  };
}

function normalizeCodexUsage(usage, contextWindow) {
  if (!usage) return null;
  return {
    input_tokens: usage.input_tokens ?? 0,
    output_tokens: usage.output_tokens ?? 0,
    total_tokens: usage.total_tokens ?? null,
    cache_read_input_tokens: usage.cached_input_tokens ?? usage.cache_read_input_tokens ?? 0,
    cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
    ...(Number.isFinite(contextWindow) ? { context_window: contextWindow } : {}),
  };
}

function findLatestAssistantIndex(messages) {
  for (let i = (messages?.length || 0) - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "assistant") return i;
  }
  return -1;
}

function buildBlockKey(turn, blockIndex) {
  return `${turn}:${blockIndex}`;
}

function findPartIndexByStreamKey(parts, streamKey, type) {
  if (!streamKey) return -1;
  return parts.findIndex((p) => p._streamKey === streamKey && (!type || p.type === type));
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
  const pendingStartsRef = useRef(new Map());

  useEffect(() => {
    if (!window.api) return;

    const offStream = window.api.onAgentStream(({ conversationId, event }) => {
      setConversations((prev) => {
        const next = new Map(prev);
        const convo = next.get(conversationId) || { messages: [], isStreaming: true, error: null };
        const msgs = [...convo.messages];
        let lastMsg = msgs[msgs.length - 1];

        if (event.session_id && convo._claudeSessionId !== event.session_id) {
          convo._claudeSessionId = event.session_id;
          console.log("[useAgent] Captured Claude session ID:", {
            conversationId,
            sessionId: event.session_id,
            eventType: event.type,
            subtype: event.subtype,
          });
        }

        const ensureAssistant = () => {
          if (!lastMsg || lastMsg.role !== "assistant") {
            lastMsg = {
              id: uid(),
              role: "assistant",
              parts: [],
              isStreaming: true,
              isThinking: false,
              _streamState: cloneStreamState(),
              _startedAt: Date.now(),
              _usage: null,
            };
            msgs.push(lastMsg);
          } else if (!lastMsg._startedAt) {
            lastMsg = { ...lastMsg, _startedAt: Date.now() };
            msgs[msgs.length - 1] = lastMsg;
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

          // Context-window fullness tracking.
          //
          // We deliberately track the LATEST API call's usage (not the turn
          // aggregate). A multi-tool-use turn re-sends the prompt once per
          // call, so aggregating would make `cache_read` balloon by the number
          // of calls — that measures how much *work* was done, not how full
          // the window is. The cumulative snapshot at the END of the last
          // call is what actually reflects "tokens currently in the window."
          //
          // - `message_start` → overwrite `_usage` (new API call begins)
          // - `message_delta` → merge (output_tokens grows during generation)
          // - `result` below → ignored for usage (it's turn-aggregated)
          if (inner.type === "message_start" && inner.message?.usage) {
            ensureAssistant();
            updateAssistant({ _usage: { ...inner.message.usage } });
          } else if (inner.type === "message_delta" && inner.usage) {
            ensureAssistant();
            updateAssistant({ _usage: mergeUsage(lastMsg._usage, inner.usage) });
          }

          if (inner.type === "content_block_start") {
            const block = inner.content_block;
            ensureAssistant();
            const parts = cloneParts(lastMsg.parts);
            const streamState = cloneStreamState(lastMsg._streamState);
            const blockIndex = inner.index;

            if (streamState.seenIndexes[blockIndex]) {
              streamState.currentTurn += 1;
              streamState.seenIndexes = {};
              streamState.activeBlocks = {};
              streamState.activeThinking = {};
            }

            streamState.seenIndexes[blockIndex] = true;
            const streamKey = buildBlockKey(streamState.currentTurn, blockIndex);
            streamState.activeBlocks[blockIndex] = streamKey;

            if (block?.type === "thinking") {
              parts.push({ type: "thinking", text: "", blockIndex, _streamKey: streamKey });
              streamState.activeThinking[streamKey] = true;
              updateAssistant({ parts, isStreaming: true, isThinking: true, _streamState: streamState });
            } else if (block?.type === "tool_use") {
              parts.push({
                type: "tool",
                id: block.id || "tc" + uid(),
                name: block.name || "unknown",
                args: {},
                argsJson: "",
                result: null,
                status: "running",
                blockIndex,
                _streamKey: streamKey,
              });
              updateAssistant({ parts, isStreaming: true, _streamState: streamState });
            } else if (block?.type === "text") {
              parts.push({ type: "text", text: "", blockIndex, _streamKey: streamKey });
              updateAssistant({ parts, isStreaming: true, _streamState: streamState });
            }
          } else if (inner.type === "content_block_delta") {
            ensureAssistant();
            const parts = cloneParts(lastMsg.parts);
            const streamState = cloneStreamState(lastMsg._streamState);
            const delta = inner.delta;
            const streamKey = streamState.activeBlocks[inner.index];
            if (delta?.type === "text_delta") {
              const textIdx = findPartIndexByStreamKey(parts, streamKey, "text");
              if (textIdx >= 0) {
                parts[textIdx] = { ...parts[textIdx], text: parts[textIdx].text + (delta.text || "") };
              }
              updateAssistant({ parts, isStreaming: true, _streamState: streamState });
            } else if (delta?.type === "input_json_delta") {
              const toolIdx = findPartIndexByStreamKey(parts, streamKey, "tool");
              if (toolIdx >= 0) {
                const newJson = (parts[toolIdx].argsJson || "") + (delta.partial_json || "");
                let newArgs = parts[toolIdx].args;
                try { newArgs = JSON.parse(newJson); } catch {}
                parts[toolIdx] = { ...parts[toolIdx], argsJson: newJson, args: newArgs };
              }
              updateAssistant({ parts, isStreaming: true, _streamState: streamState });
            } else if (delta?.type === "thinking_delta") {
              const thinkingIdx = findPartIndexByStreamKey(parts, streamKey, "thinking");
              if (thinkingIdx >= 0) {
                parts[thinkingIdx] = {
                  ...parts[thinkingIdx],
                  text: parts[thinkingIdx].text + (delta.thinking || ""),
                };
              }
              updateAssistant({ parts, isStreaming: true, isThinking: true, _streamState: streamState });
            }
          } else if (inner.type === "content_block_stop") {
            ensureAssistant();
            const streamState = cloneStreamState(lastMsg._streamState);
            const stoppedKey = streamState.activeBlocks[inner.index];
            delete streamState.activeBlocks[inner.index];

            if (stoppedKey && streamState.activeThinking[stoppedKey]) {
              delete streamState.activeThinking[stoppedKey];
            }

            updateAssistant({
              isThinking: Object.keys(streamState.activeThinking).length > 0,
              _streamState: streamState,
            });
          }
        } else if (event.type === "assistant") {
          // With --include-partial-messages, assistant events contain full accumulated text.
          // Only use these if we have NO stream_event parts yet (fallback for non-streaming).
          // Usage here is per-API-call, not cumulative — skip it to avoid flicker;
          // the `result` event below owns the authoritative cumulative usage.
          const am = ensureAssistant();
          const parts = cloneParts(lastMsg.parts);
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
            msgs[msgs.length - 1] = { ...lastMsg, parts, isThinking: false };
            lastMsg = msgs[msgs.length - 1];
          }
        } else if (event.type === "user") {
          // Capture the UUID from user events — needed for rewind/edit
          if (event.uuid) {
            console.log("[useAgent] User event UUID:", event.uuid, "has tool_result:",
              event.message?.content?.some?.(b => b.type === "tool_result"));
            // Find the last user message and store the Claude-assigned UUID
            for (let mi = msgs.length - 1; mi >= 0; mi--) {
              if (msgs[mi].role === "user" && !msgs[mi].claudeUuid) {
                msgs[mi] = { ...msgs[mi], claudeUuid: event.uuid };
                console.log("[useAgent] Stored claudeUuid on user msg:", msgs[mi].text?.slice(0, 50));
                break;
              }
            }
          }
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
            // Note: `event.usage` here is aggregated across every API call in
            // the turn (ballooned `cache_read` when the turn had multiple tool
            // loops). That's right for cost, wrong for window fullness — we
            // already captured the final call's cumulative usage from
            // `message_delta`. Leave `_usage` alone.
            if (event.is_error || event.subtype === "error_during_execution") {
              // Surface the error as text in the assistant message
              const errorText = event.result || event.error
                || (event.errors && event.errors.length > 0 ? event.errors.join("\n") : null)
                || "An error occurred.";
              const parts = cloneParts(lastMsg.parts);
              parts.push({ type: "text", text: `**Error:** ${errorText}` });
              msgs[msgs.length - 1] = freezeElapsed({ ...lastMsg, parts, isStreaming: false, isThinking: false });
            } else if (event.terminal_reason === "hook_stopped") {
              const parts = cloneParts(lastMsg.parts);
              const hasPausedStatus = parts.some((part) => part.type === "status" && part.kind === "paused");
              if (!hasPausedStatus) {
                parts.push({
                  type: "status",
                  kind: "paused",
                  title: "Paused by hook",
                  text: "Claude stopped after a tool hook returned continue: false. This is expected — send another message when you want to continue.",
                });
              }
              msgs[msgs.length - 1] = freezeElapsed({ ...lastMsg, parts, isStreaming: false, isThinking: false });
            } else {
              msgs[msgs.length - 1] = freezeElapsed({ ...lastMsg, isStreaming: false, isThinking: false });
            }
          }
        }

        // Claude Code emits a top-level `system` event with
        // `subtype: "compact_boundary"` whenever auto-compaction runs. Flag
        // the message transiently so the live status can show "compacting…";
        // `freezeElapsed` strips this on stream end so it doesn't persist.
        else if (event.type === "system" && event.subtype === "compact_boundary") {
          const am = ensureAssistant();
          msgs[msgs.length - 1] = { ...am, _compacting: true };
          lastMsg = msgs[msgs.length - 1];
        }

        // --- Codex JSONL stream events ---
        else if (event.type === "thread.started") {
          convo._codexThreadId = event.thread_id;
          console.log("[useAgent] Captured Codex thread ID:", {
            conversationId,
            threadId: event.thread_id,
          });
        } else if (event.type === "event_msg" && event.payload?.type === "token_count") {
          const tokenInfo = event.payload.info;
          const usage = normalizeCodexUsage(
            tokenInfo?.last_token_usage || tokenInfo?.total_token_usage,
            tokenInfo?.model_context_window
          );
          if (usage) {
            const am = ensureAssistant();
            msgs[msgs.length - 1] = { ...am, _usage: usage };
            lastMsg = msgs[msgs.length - 1];
          }
        } else if (event.type === "turn.started") {
          ensureAssistant();
        } else if (event.type === "item.started") {
          const item = event.item || {};
          if (item.type === "command_execution") {
            const am = ensureAssistant();
            const parts = cloneParts(am.parts);
            parts.push({
              type: "tool",
              id: item.id || uid(),
              name: item.command || "command",
              args: { command: item.command },
              result: null,
              status: "running",
            });
            msgs[msgs.length - 1] = { ...am, parts };
            lastMsg = msgs[msgs.length - 1];
          }
        } else if (event.type === "item.completed") {
          const item = event.item || {};
          if (item.type === "agent_message") {
            const am = ensureAssistant();
            const parts = cloneParts(am.parts);
            parts.push({ type: "text", text: item.text || "" });
            msgs[msgs.length - 1] = { ...am, parts };
            lastMsg = msgs[msgs.length - 1];
          } else if (item.type === "command_execution") {
            const am = ensureAssistant();
            const parts = cloneParts(am.parts);
            const existingIdx = parts.findIndex(
              (p) => p.type === "tool" && p.id === item.id
            );
            if (existingIdx >= 0) {
              parts[existingIdx] = {
                ...parts[existingIdx],
                result: item.aggregated_output,
                status: "done",
              };
            } else {
              parts.push({
                type: "tool",
                id: item.id || uid(),
                name: item.command || "command",
                args: { command: item.command },
                result: item.aggregated_output,
                status: "done",
              });
            }
            msgs[msgs.length - 1] = { ...am, parts };
            lastMsg = msgs[msgs.length - 1];
          }
        } else if (event.type === "turn.completed") {
          if (lastMsg && lastMsg.role === "assistant") {
            // Do not fall back to `turn.completed.usage` for Codex. Those
            // numbers are cumulative across the whole session, not the current
            // prompt window, and produce impossible `ctx` readings. The live
            // `token_count` event above is the only trustworthy source here.
            msgs[msgs.length - 1] = freezeElapsed({ ...lastMsg, isStreaming: false, isThinking: false });
            lastMsg = msgs[msgs.length - 1];
          }
        }

        next.set(conversationId, { ...convo, messages: msgs });
        return next;
      });
    });

    const offDone = window.api.onAgentDone(({ conversationId }) => {
      pendingStartsRef.current.delete(conversationId);
      let codexThreadId = null;
      let needsUsageHydration = false;
      setConversations((prev) => {
        const next = new Map(prev);
        const convo = next.get(conversationId);
        if (convo) {
          codexThreadId = convo._codexThreadId || null;
          const msgs = convo.messages.map((m) =>
            m.role === "assistant" ? freezeElapsed({ ...m, isStreaming: false, isThinking: false }) : m
          );
          const latestAssistantIdx = findLatestAssistantIndex(msgs);
          if (latestAssistantIdx >= 0 && !msgs[latestAssistantIdx]?._usage && codexThreadId) {
            needsUsageHydration = true;
          }
          next.set(conversationId, { ...convo, messages: msgs, isStreaming: false });
        }
        return next;
      });

      if (needsUsageHydration && codexThreadId && window.api?.loadSession) {
        void window.api.loadSession(codexThreadId).then((result) => {
          const fallbackAssistantIdx = findLatestAssistantIndex(result?.messages || []);
          const fallbackUsage =
            result?.usageSnapshot ||
            (fallbackAssistantIdx >= 0 ? result.messages[fallbackAssistantIdx]?._usage : null) ||
            null;
          if (!fallbackUsage) return;

          setConversations((prev) => {
            const next = new Map(prev);
            const convo = next.get(conversationId);
            if (!convo) return prev;

            const msgs = [...convo.messages];
            const latestAssistantIdx = findLatestAssistantIndex(msgs);
            if (latestAssistantIdx < 0 || msgs[latestAssistantIdx]?._usage) return prev;

            msgs[latestAssistantIdx] = {
              ...msgs[latestAssistantIdx],
              _usage: fallbackUsage,
            };
            next.set(conversationId, { ...convo, messages: msgs });
            return next;
          });
        }).catch(() => {});
      }
    });

    const offError = window.api.onAgentError(({ conversationId, error }) => {
      pendingStartsRef.current.delete(conversationId);
      setConversations((prev) => {
        const next = new Map(prev);
        const convo = next.get(conversationId) || { messages: [], isStreaming: false, error: null };
        // Surface error in the last assistant message
        const msgs = [...convo.messages];
        const lastMsg = msgs[msgs.length - 1];
        if (lastMsg && lastMsg.role === "assistant") {
          const parts = cloneParts(lastMsg.parts);
          parts.push({ type: "text", text: `**Error:** ${error}` });
          msgs[msgs.length - 1] = freezeElapsed({ ...lastMsg, parts, isStreaming: false, isThinking: false });
        }
        next.set(conversationId, { messages: msgs, error, isStreaming: false });
        return next;
      });
    });

    cleanupRefs.current = [offStream, offDone, offError];
    return () => cleanupRefs.current.forEach((fn) => fn?.());
  }, []);

  const prepareMessage = useCallback(({ conversationId, prompt, images, files }) => {
    const pendingId = uid();
    pendingStartsRef.current.set(conversationId, pendingId);
    setConversations((prev) => {
      const next = new Map(prev);
      const convo = next.get(conversationId) || { messages: [], isStreaming: false, error: null };
      const msgs = [
        ...convo.messages,
        { id: uid(), role: "user", text: prompt, images, files },
        { id: uid(), role: "assistant", parts: [], isStreaming: true, isThinking: false, _startedAt: Date.now(), _usage: null },
      ];
      next.set(conversationId, { messages: msgs, isStreaming: true, error: null });
      return next;
    });
    return pendingId;
  }, []);

  const appendLocalMessages = useCallback((conversationId, messages) => {
    if (!conversationId || !Array.isArray(messages) || messages.length === 0) return;

    setConversations((prev) => {
      const next = new Map(prev);
      const convo = next.get(conversationId) || { messages: [], isStreaming: false, error: null };
      const appended = messages.map((message) => ({
        id: message.id || uid(),
        ...message,
      }));

      next.set(conversationId, {
        ...convo,
        messages: [...convo.messages, ...appended],
        isStreaming: false,
        error: null,
      });
      return next;
    });
  }, []);

  const startPreparedMessage = useCallback(({ conversationId, pendingId, sessionId, prompt, model, provider, effort, cwd, images, files, resumeSessionId, forkSession }) => {
    const expectedPendingId = pendingStartsRef.current.get(conversationId);
    if (pendingId && expectedPendingId !== pendingId) {
      console.log("[useAgent] Skipping stale or cancelled pending start", { conversationId, pendingId, expectedPendingId });
      return false;
    }
    if (pendingId) pendingStartsRef.current.delete(conversationId);
    if (window.api) {
      window.api.agentStart({ conversationId, sessionId, prompt, model, provider, effort, cwd, images, files, resumeSessionId, forkSession });
    }
    return true;
  }, []);

  const cancelMessage = useCallback((conversationId) => {
    const pendingId = pendingStartsRef.current.get(conversationId);
    if (pendingId) {
      pendingStartsRef.current.delete(conversationId);
      setConversations((prev) => {
        const next = new Map(prev);
        const convo = next.get(conversationId);
        if (convo) {
          const msgs = convo.messages.map((m) =>
            m.role === "assistant" ? freezeElapsed({ ...m, isStreaming: false, isThinking: false }) : m
          );
          next.set(conversationId, { ...convo, messages: msgs, isStreaming: false, error: null });
        }
        return next;
      });
    }

    if (window.api) {
      window.api.agentCancel({ conversationId });
    }
  }, []);

  const editAndResend = useCallback(({ conversationId, sessionId, messageIndex, newText, wirePrompt, model, provider, effort, cwd }) => {
    setConversations((prev) => {
      const next = new Map(prev);
      const convo = next.get(conversationId);
      if (convo) {
        const msgs = convo.messages.slice(0, messageIndex);
        msgs.push({ id: uid(), role: "user", text: newText });
        msgs.push({ id: uid(), role: "assistant", parts: [], isStreaming: true, isThinking: false, _startedAt: Date.now(), _usage: null });
        next.set(conversationId, { messages: msgs, isStreaming: true, error: null });
      }
      return next;
    });

    if (window.api) {
      window.api.agentEditAndResend({
        conversationId,
        resumeSessionId: sessionId,
        forkSession: true,
        prompt: wirePrompt ?? newText,
        model,
        provider,
        effort,
        cwd,
      });
      return true;
    }
    return false;
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

  return {
    conversations,
    getConversation,
    prepareMessage,
    appendLocalMessages,
    startPreparedMessage,
    cancelMessage,
    editAndResend,
    loadMessages,
  };
}
