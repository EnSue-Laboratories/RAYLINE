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

function mapMulticaTaskMessage(p) {
  // Target the `{type: "tool"}` part shape that Message.jsx renders via
  // ToolCallBlock. Multica carries no tool_use_id, so the task:message
  // handler pairs tool_use/tool_result by name+order (see pairing below).
  switch (p.type) {
    case "text": return { type: "text", text: p.content || "" };
    case "tool_use": return { type: "tool", id: "mt" + uid(), name: p.tool, args: p.input || {}, result: null, status: "running" };
    case "tool_result": return { type: "tool", id: "mt" + uid(), name: p.tool, args: {}, result: p.output || "", status: "done" };
    case "error": return { type: "text", text: `_${p.content || "error"}_` };
    default: return null;
  }
}

// Multica pairs: match an incoming tool_result to the most recent tool_use
// part with the same name that hasn't been completed yet. Without a
// tool_use_id, order + name is the best correlation we have.
function findPendingMulticaToolIdx(parts, name) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    if (p.type === "tool" && p.status === "running" && p.name === name) return i;
  }
  return -1;
}

function mergeUsage(prev, incoming) {
  if (!incoming) return prev || null;
  const base = prev || {};
  const incomingCost = Number(incoming.cost_usd);
  const baseCost = Number(base.cost_usd);
  return {
    input_tokens: incoming.input_tokens ?? base.input_tokens ?? 0,
    output_tokens: incoming.output_tokens ?? base.output_tokens ?? 0,
    reasoning_tokens: incoming.reasoning_tokens ?? base.reasoning_tokens ?? 0,
    cache_creation_input_tokens:
      incoming.cache_creation_input_tokens ?? base.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens:
      incoming.cache_read_input_tokens ?? base.cache_read_input_tokens ?? 0,
    ...(incomingCost > 0
      ? { cost_usd: incomingCost }
      : baseCost > 0
        ? { cost_usd: baseCost }
        : {}),
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

// Codex emits plan-quota snapshots inside the same `token_count` event as token
// usage — `payload.rate_limits` is a sibling of `payload.info`. The shape uses
// `primary` (5h rolling window, window_minutes=300) and `secondary` (7d, =10080).
// Normalize to a provider-agnostic shape so Claude Code's statusline JSON
// (`five_hour`/`seven_day`) can later reuse the same renderer.
function normalizeCodexRateLimits(rl) {
  if (!rl || typeof rl !== "object") return null;
  const pickWindow = (w) => {
    if (!w || typeof w !== "object") return null;
    if (!Number.isFinite(w.used_percent)) return null;
    return {
      used_percent: w.used_percent,
      resets_at: Number.isFinite(w.resets_at) ? w.resets_at : null,
      window_minutes: Number.isFinite(w.window_minutes) ? w.window_minutes : null,
    };
  };
  const five = pickWindow(rl.primary);
  const seven = pickWindow(rl.secondary);
  if (!five && !seven) return null;
  return {
    ...(five ? { five_hour: five } : {}),
    ...(seven ? { seven_day: seven } : {}),
    ...(rl.plan_type ? { plan_type: rl.plan_type } : {}),
  };
}

function extractSessionStatsFromResult(result) {
  const fallbackAssistantIdx = findLatestAssistantIndex(result?.messages || []);
  return {
    usage:
      result?.usageSnapshot ||
      (fallbackAssistantIdx >= 0 ? result.messages[fallbackAssistantIdx]?._usage : null) ||
      null,
    rateLimits:
      result?.rateLimitsSnapshot ||
      (fallbackAssistantIdx >= 0 ? result.messages[fallbackAssistantIdx]?._rateLimits : null) ||
      null,
  };
}

function findLatestAssistantIndex(messages) {
  for (let i = (messages?.length || 0) - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "assistant") return i;
  }
  return -1;
}

const CODEX_USAGE_HYDRATION_RETRY_DELAYS_MS = [0, 150, 500, 1200, 2500];

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

function extractCodexResponseText(content) {
  if (!Array.isArray(content)) return "";
  return content
    .filter((item) => item?.type === "output_text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("");
}

function normalizeCodexToolArgs(payload) {
  const raw = payload?.arguments ?? payload?.input;
  if (raw == null) return {};
  if (typeof raw === "object") {
    return raw.cmd && !raw.command ? { ...raw, command: raw.cmd } : raw;
  }
  if (typeof raw !== "string") return { value: raw };

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed.cmd && !parsed.command ? { ...parsed, command: parsed.cmd } : parsed;
    }
  } catch {
    // Fall through to the raw string payload shape below.
  }

  return payload?.type === "custom_tool_call" ? { input: raw } : { value: raw };
}

function normalizeCodexToolResult(output) {
  if (typeof output !== "string") return output;
  const trimmed = output.trim();
  if (!trimmed) return output;
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return output;
  try {
    return JSON.parse(output);
  } catch {
    return output;
  }
}

function extractOpenCodeText(event) {
  if (!event || typeof event !== "object") return "";
  const candidates = [
    event.text,
    event.delta,
    event.content,
    event.message,
    event.part?.text,
    event.part?.content,
  ];
  return candidates.find((value) => typeof value === "string" && value.length > 0) || "";
}

const OPENCODE_TOOL_NAMES = {
  bash: "Bash",
  edit: "Edit",
  grep: "Grep",
  glob: "Glob",
  read: "Read",
  write: "Write",
};

function normalizeOpenCodeToolName(name) {
  const raw = typeof name === "string" ? name : "";
  return OPENCODE_TOOL_NAMES[raw.toLowerCase()] || raw || "tool";
}

function normalizeOpenCodeToolArgs(name, input) {
  const args = input && typeof input === "object" ? { ...input } : {};
  if (args.filePath && !args.file_path) args.file_path = args.filePath;
  if (name === "Bash" && args.cmd && !args.command) args.command = args.cmd;
  return args;
}

function extractOpenCodeSessionId(event) {
  return (
    event?.sessionID ||
    event?.session_id ||
    event?.sessionId ||
    event?.session?.id ||
    event?.part?.sessionID ||
    null
  );
}

function extractOpenCodeTool(event) {
  const part = event?.part || {};
  const state = part.state && typeof part.state === "object" ? part.state : {};
  const name = normalizeOpenCodeToolName(event?.tool || event?.name || part.tool || part.name || part.type);
  const input = event?.input ?? state.input ?? part.input ?? part.args ?? part.parameters ?? {};
  const output = event?.output ?? state.output ?? part.output ?? part.result ?? null;
  const status = state.status || part.status || event.status || "";
  return {
    id: event?.callID || part.callID || event?.id || part.id || "oc" + uid(),
    name,
    args: normalizeOpenCodeToolArgs(name, input),
    result: output ?? state.error ?? null,
    status: status === "completed" || output != null ? "done" : "running",
    _opencodeTime: state.time?.start || part.time?.start || event?.timestamp || Date.now(),
  };
}

function buildOpenCodeTextPart(event) {
  const part = event?.part || {};
  const text = event.type === "opencode_stdout" ? event.text : extractOpenCodeText(event);
  if (!text) return null;
  return {
    type: "text",
    id: part.id || event.id || "oct" + uid(),
    text,
    _opencodeTime: part.time?.start || event.timestamp || Date.now(),
  };
}

function extractOpenCodeReasoningText(event) {
  if (!event || typeof event !== "object") return "";
  const part = event.part || {};
  const candidates = [
    event.thinking,
    event.reasoning,
    event.text,
    event.content,
    part.text,
    part.content,
  ];
  return candidates.find((value) => typeof value === "string" && value.length > 0) || "";
}

function buildOpenCodeThinkingPart(event) {
  const part = event?.part || {};
  const text = extractOpenCodeReasoningText(event);
  if (!text) return null;
  const startedAt = Number(part.time?.start);
  const endedAt = Number(part.time?.end);
  return {
    type: "thinking",
    id: part.id || event.id || "ocr" + uid(),
    text,
    _opencodeTime: Number.isFinite(startedAt) ? startedAt : event.timestamp || Date.now(),
    ...(Number.isFinite(startedAt) && Number.isFinite(endedAt) && endedAt >= startedAt
      ? { durationMs: endedAt - startedAt }
      : {}),
  };
}

const THINK_TAG_RE = /<(?<tag>think|thinking|antThinking)\b[^>]*>(?<text>[\s\S]*?)<\/\k<tag>>/gi;

function splitOpenCodeTextAndThinkingParts(event) {
  const textPart = buildOpenCodeTextPart(event);
  if (!textPart) return [];
  const rawText = textPart.text || "";
  const trimmed = rawText.trim();

  if (event.type === "opencode_stdout" && /^Thinking:\s*/i.test(trimmed)) {
    return [{
      ...textPart,
      type: "thinking",
      id: `${textPart.id}-thinking`,
      text: trimmed.replace(/^Thinking:\s*/i, ""),
    }];
  }

  const pieces = [];
  let lastIndex = 0;
  let match;
  THINK_TAG_RE.lastIndex = 0;

  while ((match = THINK_TAG_RE.exec(rawText)) !== null) {
    const before = rawText.slice(lastIndex, match.index);
    if (before.trim()) {
      pieces.push({
        ...textPart,
        id: `${textPart.id}-text-${pieces.length}`,
        text: before,
      });
    }

    const thinkingText = (match.groups?.text || "").trim();
    if (thinkingText) {
      pieces.push({
        ...textPart,
        type: "thinking",
        id: `${textPart.id}-thinking-${pieces.length}`,
        text: thinkingText,
      });
    }
    lastIndex = match.index + match[0].length;
  }

  const after = rawText.slice(lastIndex);
  if (after.trim()) {
    pieces.push({
      ...textPart,
      id: `${textPart.id}-text-${pieces.length}`,
      text: after,
    });
  }

  return pieces.length > 0 ? pieces : [textPart];
}

function sortOpenCodeParts(parts) {
  return [...parts].sort((a, b) => {
    const at = Number.isFinite(a?._opencodeTime) ? a._opencodeTime : Number.POSITIVE_INFINITY;
    const bt = Number.isFinite(b?._opencodeTime) ? b._opencodeTime : Number.POSITIVE_INFINITY;
    if (at !== bt) return at - bt;
    return 0;
  });
}

function upsertOpenCodePart(parts, nextPart) {
  const idx = parts.findIndex((part) => part.type === nextPart.type && part.id === nextPart.id);
  if (idx >= 0) {
    const updated = [...parts];
    updated[idx] = { ...updated[idx], ...nextPart };
    return sortOpenCodeParts(updated);
  }
  return sortOpenCodeParts([...parts, nextPart]);
}

function normalizeOpenCodeUsage(part, previousUsage) {
  const tokens = part?.tokens;
  if (!tokens || typeof tokens !== "object") return previousUsage || null;
  const previousCost = Number.isFinite(previousUsage?.cost_usd) ? previousUsage.cost_usd : 0;
  const stepCost = Number(part.cost);
  const safeStepCost = Number.isFinite(stepCost) && stepCost > 0 ? stepCost : 0;
  return {
    input_tokens: tokens.input ?? 0,
    output_tokens: tokens.output ?? 0,
    total_tokens: tokens.total ?? null,
    cache_read_input_tokens: tokens.cache?.read ?? 0,
    cache_creation_input_tokens: tokens.cache?.write ?? 0,
    reasoning_tokens: tokens.reasoning ?? 0,
    ...(previousCost > 0 || safeStepCost > 0 ? { cost_usd: previousCost + safeStepCost } : {}),
  };
}

function extractOpenCodeError(event) {
  if (!event || typeof event !== "object") return "";
  return (
    (typeof event.message === "string" && event.message) ||
    (typeof event.error === "string" && event.error) ||
    (typeof event.error?.message === "string" && event.error.message) ||
    (typeof event.error?.data?.message === "string" && event.error.data.message) ||
    "OpenCode run failed."
  );
}

export default function useAgent() {
  const [conversations, setConversations] = useState(new Map());
  const cleanupRefs = useRef([]);
  const pendingStartsRef = useRef(new Map());
  const usageHydrationTimersRef = useRef(new Set());

  useEffect(() => {
    if (!window.api) return;

    const scheduleUsageHydrationRetry = (conversationId, codexThreadId, attempt = 0) => {
      if (!window.api?.loadSession) return;

      void window.api.loadSession(codexThreadId).then((result) => {
        const { usage: fallbackUsage, rateLimits: fallbackRateLimits } = extractSessionStatsFromResult(result);
        if (fallbackUsage || fallbackRateLimits) {
          setConversations((prev) => {
            const next = new Map(prev);
            const convo = next.get(conversationId);
            if (!convo) return prev;

            const msgs = [...convo.messages];
            const latestAssistantIdx = findLatestAssistantIndex(msgs);
            if (latestAssistantIdx < 0) return prev;

            const currentAssistant = msgs[latestAssistantIdx];
            const nextUsage = currentAssistant?._usage || fallbackUsage || null;
            const nextRateLimits = currentAssistant?._rateLimits || fallbackRateLimits || null;

            if (nextUsage === currentAssistant?._usage && nextRateLimits === currentAssistant?._rateLimits) {
              return prev;
            }

            msgs[latestAssistantIdx] = {
              ...currentAssistant,
              ...(nextUsage ? { _usage: nextUsage } : {}),
              ...(nextRateLimits ? { _rateLimits: nextRateLimits } : {}),
            };
            next.set(conversationId, { ...convo, messages: msgs });
            return next;
          });
          return;
        }

        const nextDelay = CODEX_USAGE_HYDRATION_RETRY_DELAYS_MS[attempt + 1];
        if (nextDelay == null) return;

        const timerId = window.setTimeout(() => {
          usageHydrationTimersRef.current.delete(timerId);
          scheduleUsageHydrationRetry(conversationId, codexThreadId, attempt + 1);
        }, nextDelay);
        usageHydrationTimersRef.current.add(timerId);
      }).catch(() => {
        const nextDelay = CODEX_USAGE_HYDRATION_RETRY_DELAYS_MS[attempt + 1];
        if (nextDelay == null) return;

        const timerId = window.setTimeout(() => {
          usageHydrationTimersRef.current.delete(timerId);
          scheduleUsageHydrationRetry(conversationId, codexThreadId, attempt + 1);
        }, nextDelay);
        usageHydrationTimersRef.current.add(timerId);
      });
    };

    const offStream = window.api.onAgentStream(({ conversationId, event }) => {
      setConversations((prev) => {
        const next = new Map(prev);
        const convo = next.get(conversationId) || { messages: [], isStreaming: true, error: null };
        const msgs = [...convo.messages];
        let lastMsg = msgs[msgs.length - 1];
        // Some runs finish logically before the underlying CLI process fully
        // exits, e.g. a background shell keeps stdout/stderr open for a moment.
        // Track the conversation-level flag separately so we can unblock the UI
        // on terminal completion events without waiting for `agent-done`.
        let nextIsStreaming = Boolean(convo.isStreaming);

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

        if (typeof event.type === "string" && event.type.startsWith("multica:")) {
          const inner = event.type.slice("multica:".length);
          const p = event.payload || {};
          // transient — resets per-session; stripped in buildPersistedConversationSnapshot
          const connectedPatch = convo.multicaConnected ? null : { multicaConnected: true };

          // No-op branches return early WITHOUT running ensureAssistant — we
          // don't want a stray empty assistant bubble if a user echo arrives
          // before any task:message.
          if (inner === "chat:message" && p.role === "user") {
            if (connectedPatch) next.set(conversationId, { ...convo, ...connectedPatch });
            return next;
          }
          if (inner === "agent:status") {
            window.dispatchEvent(new CustomEvent("multica-agent-status", { detail: p.agent }));
            if (connectedPatch) next.set(conversationId, { ...convo, ...connectedPatch });
            return next;
          }

          const assistant = ensureAssistant();

          if (inner === "task:message") {
            const part = mapMulticaTaskMessage(p);
            if (!part) {
              if (connectedPatch) next.set(conversationId, { ...convo, ...connectedPatch });
              return next;
            }
            const parts = [...(assistant.parts || [])];
            if (p.type === "tool_result") {
              const pendingIdx = findPendingMulticaToolIdx(parts, p.tool);
              if (pendingIdx >= 0) {
                parts[pendingIdx] = { ...parts[pendingIdx], result: p.output || "", status: "done" };
              } else {
                parts.push(part);
              }
            } else {
              parts.push(part);
            }
            msgs[msgs.length - 1] = { ...assistant, parts, isStreaming: true };
            next.set(conversationId, { ...convo, ...connectedPatch, messages: msgs, isStreaming: true });
            return next;
          }

          if (inner === "chat:done" || inner === "task:completed") {
            msgs[msgs.length - 1] = freezeElapsed({ ...assistant, isStreaming: false });
            next.set(conversationId, { ...convo, ...connectedPatch, messages: msgs, isStreaming: false });
            return next;
          }

          if (inner === "task:cancelled") {
            msgs[msgs.length - 1] = freezeElapsed({ ...assistant, isStreaming: false });
            next.set(conversationId, { ...convo, ...connectedPatch, messages: msgs, isStreaming: false, error: null });
            return next;
          }

          if (inner === "task:failed" || inner === "error") {
            msgs[msgs.length - 1] = freezeElapsed({
              ...assistant, isStreaming: false,
              parts: [...(assistant.parts || []), { type: "text", text: `_Multica ${inner}: ${p.message || p.reason || ""}_` }],
            });
            next.set(conversationId, { ...convo, ...connectedPatch, messages: msgs, isStreaming: false, error: p.message || inner });
            return next;
          }

          if (connectedPatch) next.set(conversationId, { ...convo, ...connectedPatch });
          return next;
        }

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
                try {
                  newArgs = JSON.parse(newJson);
                } catch {
                  // Keep accumulating partial JSON until it becomes parseable.
                }
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
          ensureAssistant();
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
          nextIsStreaming = false;
        }

        // Claude Code plan quota — synthetic event emitted by the main process
        // after each `result`, sourced from `api.anthropic.com/api/oauth/usage`
        // (Pro/Max only — silently absent for API-key users). Already
        // normalized to the same `{ five_hour, seven_day }` shape Codex uses,
        // so it just attaches to the latest assistant message.
        else if (event.type === "rate_limits" && event.rate_limits) {
          const idx = findLatestAssistantIndex(msgs);
          if (idx >= 0) {
            msgs[idx] = { ...msgs[idx], _rateLimits: event.rate_limits };
            if (idx === msgs.length - 1) lastMsg = msgs[idx];
          }
        }

        else if (event.type === "session_snapshot" && event.provider === "codex") {
          if (event.thread_id) {
            convo._codexThreadId = event.thread_id;
          }
          const idx = findLatestAssistantIndex(msgs);
          if (idx >= 0) {
            msgs[idx] = {
              ...msgs[idx],
              ...(event.usage
                ? { _usage: mergeUsage(msgs[idx]._usage, event.usage) }
                : {}),
              ...(event.rate_limits ? { _rateLimits: event.rate_limits } : {}),
            };
            if (idx === msgs.length - 1) lastMsg = msgs[idx];
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

        // --- OpenCode JSONL stream events ---
        else if (
          event.type === "opencode_stdout" ||
          event.type === "step_start" ||
          event.type === "tool_use" ||
          event.type === "reasoning" ||
          event.type === "text" ||
          event.type === "step_finish" ||
          event.type === "error"
        ) {
          const sessionId = extractOpenCodeSessionId(event);
          if (sessionId) {
            convo._opencodeSessionId = sessionId;
            console.log("[useAgent] Captured OpenCode session ID:", {
              conversationId,
              sessionId,
              eventType: event.type,
            });
          }

          if (event.type === "step_start") {
            ensureAssistant();
          } else if (event.type === "tool_use") {
            const am = ensureAssistant();
            const tool = extractOpenCodeTool(event);
            const parts = upsertOpenCodePart(cloneParts(am.parts), { type: "tool", ...tool });
            msgs[msgs.length - 1] = { ...am, parts, isStreaming: true };
            lastMsg = msgs[msgs.length - 1];
          } else if (event.type === "reasoning") {
            const thinkingPart = buildOpenCodeThinkingPart(event);
            if (thinkingPart) {
              const am = ensureAssistant();
              const parts = upsertOpenCodePart(cloneParts(am.parts), thinkingPart);
              const stillThinking = !Number.isFinite(thinkingPart.durationMs);
              msgs[msgs.length - 1] = { ...am, parts, isStreaming: true, isThinking: stillThinking };
              lastMsg = msgs[msgs.length - 1];
            }
          } else if (event.type === "text" || event.type === "opencode_stdout") {
            const textParts = splitOpenCodeTextAndThinkingParts(event);
            if (textParts.length > 0) {
              const am = ensureAssistant();
              const parts = textParts.reduce(
                (acc, textPart) => upsertOpenCodePart(acc, textPart),
                cloneParts(am.parts)
              );
              msgs[msgs.length - 1] = { ...am, parts, isStreaming: true, isThinking: false };
              lastMsg = msgs[msgs.length - 1];
            }
          } else if (event.type === "error") {
            const am = ensureAssistant();
            const parts = cloneParts(am.parts);
            parts.push({ type: "text", text: `**Error:** ${extractOpenCodeError(event)}` });
            msgs[msgs.length - 1] = freezeElapsed({ ...am, parts, isStreaming: false, isThinking: false });
            lastMsg = msgs[msgs.length - 1];
            nextIsStreaming = false;
          } else if (event.type === "step_finish") {
            const am = ensureAssistant();
            const usage = normalizeOpenCodeUsage(event.part, am._usage);
            if (usage) {
              msgs[msgs.length - 1] = { ...am, _usage: usage };
              lastMsg = msgs[msgs.length - 1];
            }
            const reason = event.reason || event.part?.reason || event.status || "";
            if (/^(stop|done|complete|completed|end_turn)$/i.test(String(reason))) {
              msgs[msgs.length - 1] = freezeElapsed({ ...lastMsg, isStreaming: false, isThinking: false });
              lastMsg = msgs[msgs.length - 1];
              nextIsStreaming = false;
            }
          }
        }

        // --- Codex JSONL stream events ---
        else if (event.type === "session_meta" && event.payload?.id) {
          convo._codexThreadId = event.payload.id;
          console.log("[useAgent] Captured Codex thread ID:", {
            conversationId,
            threadId: event.payload.id,
            source: "session_meta",
          });
        } else if (event.type === "thread.started") {
          convo._codexThreadId = event.thread_id;
          console.log("[useAgent] Captured Codex thread ID:", {
            conversationId,
            threadId: event.thread_id,
            source: "thread.started",
          });
        } else if (event.type === "event_msg" && event.payload?.type === "token_count") {
          const tokenInfo = event.payload.info;
          const usage = normalizeCodexUsage(
            tokenInfo?.last_token_usage || tokenInfo?.total_token_usage,
            tokenInfo?.model_context_window
          );
          const rateLimits = normalizeCodexRateLimits(event.payload.rate_limits);
          if (usage || rateLimits) {
            const am = ensureAssistant();
            const patch = { ...am };
            if (usage) patch._usage = usage;
            if (rateLimits) patch._rateLimits = rateLimits;
            msgs[msgs.length - 1] = patch;
            lastMsg = msgs[msgs.length - 1];
          }
        } else if (event.type === "event_msg" && event.payload?.type === "task_started") {
          const am = ensureAssistant();
          const contextWindow = event.payload.model_context_window;
          if (Number.isFinite(contextWindow)) {
            msgs[msgs.length - 1] = {
              ...am,
              _usage: mergeUsage(am._usage, { context_window: contextWindow }),
            };
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
        } else if (event.type === "response_item") {
          const payload = event.payload || {};
          if (payload.type === "message" && payload.role === "assistant") {
            const text = extractCodexResponseText(payload.content);
            if (text) {
              const am = ensureAssistant();
              const parts = cloneParts(am.parts);
              parts.push({ type: "text", text });
              msgs[msgs.length - 1] = { ...am, parts };
              lastMsg = msgs[msgs.length - 1];
            }
          } else if (payload.type === "function_call" || payload.type === "custom_tool_call") {
            const am = ensureAssistant();
            const parts = cloneParts(am.parts);
            const toolId = payload.call_id || uid();
            const existingIdx = parts.findIndex((p) => p.type === "tool" && p.id === toolId);
            const nextTool = {
              type: "tool",
              id: toolId,
              name: payload.name || "tool",
              args: normalizeCodexToolArgs(payload),
              result: existingIdx >= 0 ? parts[existingIdx].result : null,
              status: payload.status === "completed" ? "done" : "running",
            };

            if (existingIdx >= 0) {
              parts[existingIdx] = { ...parts[existingIdx], ...nextTool };
            } else {
              parts.push(nextTool);
            }

            msgs[msgs.length - 1] = { ...am, parts };
            lastMsg = msgs[msgs.length - 1];
          } else if (payload.type === "function_call_output" || payload.type === "custom_tool_call_output") {
            const am = ensureAssistant();
            const parts = cloneParts(am.parts);
            const existingIdx = parts.findIndex(
              (p) => p.type === "tool" && p.id === payload.call_id
            );
            const result = normalizeCodexToolResult(payload.output);

            if (existingIdx >= 0) {
              parts[existingIdx] = {
                ...parts[existingIdx],
                result,
                status: "done",
              };
            } else {
              parts.push({
                type: "tool",
                id: payload.call_id || uid(),
                name: "tool",
                args: {},
                result,
                status: "done",
              });
            }

            msgs[msgs.length - 1] = { ...am, parts };
            lastMsg = msgs[msgs.length - 1];
          }
        } else if (event.type === "turn.completed") {
          if (lastMsg && lastMsg.role === "assistant") {
            // RayLine's live Codex stdout still uses the older
            // `thread.started`/`turn.completed` schema even though the saved
            // session JSONL now contains the richer `token_count` event.
            // Merge this older usage packet as an immediate fallback so the
            // footer can render without waiting for session-file hydration.
            const fallbackUsage = normalizeCodexUsage(event.usage);
            msgs[msgs.length - 1] = freezeElapsed({
              ...lastMsg,
              ...(fallbackUsage
                ? { _usage: mergeUsage(lastMsg._usage, fallbackUsage) }
                : {}),
              isStreaming: false,
              isThinking: false,
            });
            lastMsg = msgs[msgs.length - 1];
          }
          nextIsStreaming = false;
        } else if (event.type === "event_msg" && event.payload?.type === "task_complete") {
          const completionText = event.payload.last_agent_message;
          const am = ensureAssistant();
          let parts = cloneParts(am.parts);
          const hasText = parts.some((part) => part.type === "text" && part.text);

          if (!hasText && completionText) {
            parts.push({ type: "text", text: completionText });
          }

          msgs[msgs.length - 1] = freezeElapsed({
            ...am,
            parts,
            isStreaming: false,
            isThinking: false,
          });
          lastMsg = msgs[msgs.length - 1];
          nextIsStreaming = false;
        }

        next.set(conversationId, { ...convo, messages: msgs, isStreaming: nextIsStreaming });
        return next;
      });
    });

    const offDone = window.api.onAgentDone(({ conversationId, provider, threadId }) => {
      pendingStartsRef.current.delete(conversationId);
      let codexThreadId = null;
      let needsUsageHydration = false;
      setConversations((prev) => {
        const next = new Map(prev);
        const convo = next.get(conversationId);
        if (convo) {
          codexThreadId =
            convo._codexThreadId ||
            (provider === "codex" && typeof threadId === "string" && threadId ? threadId : null);
          const msgs = convo.messages.map((m) =>
            m.role === "assistant" ? freezeElapsed({ ...m, isStreaming: false, isThinking: false }) : m
          );
          const latestAssistantIdx = findLatestAssistantIndex(msgs);
          if (
            latestAssistantIdx >= 0 &&
            codexThreadId &&
            (!msgs[latestAssistantIdx]?._usage || !msgs[latestAssistantIdx]?._rateLimits)
          ) {
            needsUsageHydration = true;
          }
          next.set(conversationId, {
            ...convo,
            ...(codexThreadId ? { _codexThreadId: codexThreadId } : {}),
            messages: msgs,
            isStreaming: false,
          });
        }
        return next;
      });

      if (needsUsageHydration && codexThreadId && window.api?.loadSession) {
        scheduleUsageHydrationRetry(conversationId, codexThreadId);
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

    const cleanupFns = [offStream, offDone, offError];
    const usageHydrationTimers = usageHydrationTimersRef.current;
    cleanupRefs.current = cleanupFns;
    return () => {
      cleanupFns.forEach((fn) => fn?.());
      usageHydrationTimers.forEach((timerId) => window.clearTimeout(timerId));
      usageHydrationTimers.clear();
    };
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

  const startPreparedMessage = useCallback(({ conversationId, pendingId, sessionId, prompt, model, provider, effort, thinking, cwd, images, files, resumeSessionId, forkSession, multicaContext, multicaToken }) => {
    const expectedPendingId = pendingStartsRef.current.get(conversationId);
    if (pendingId && expectedPendingId !== pendingId) {
      console.log("[useAgent] Skipping stale or cancelled pending start", { conversationId, pendingId, expectedPendingId });
      return false;
    }
    if (pendingId) pendingStartsRef.current.delete(conversationId);
    if (window.api) {
      const payload = { conversationId, sessionId, prompt, model, provider, effort, thinking, cwd, images, files, resumeSessionId, forkSession };
      if (provider === "multica") {
        payload._multica = multicaContext;
        payload._multicaToken = multicaToken;
      }
      window.api.agentStart(payload);
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

  const editAndResend = useCallback(({ conversationId, sessionId, messageIndex, newText, wirePrompt, model, provider, effort, thinking, cwd, multicaContext, multicaToken }) => {
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
      if (provider === "multica") {
        window.api.agentStart({
          conversationId,
          prompt: wirePrompt ?? newText,
          model,
          provider,
          effort,
          thinking,
          cwd,
          _multica: multicaContext,
          _multicaToken: multicaToken,
        });
        return true;
      }
      window.api.agentEditAndResend({
        conversationId,
        resumeSessionId: sessionId,
        forkSession: true,
        prompt: wirePrompt ?? newText,
        model,
        provider,
        effort,
        thinking,
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

  const replaceMessages = useCallback((conversationId, messages) => {
    if (!conversationId) return;
    const nextMessages = Array.isArray(messages)
      ? messages.map((message) => ({
          id: message.id || uid(),
          ...message,
        }))
      : [];

    setConversations((prev) => {
      const next = new Map(prev);
      const convo = next.get(conversationId) || { messages: [], isStreaming: false, error: null };
      next.set(conversationId, {
        ...convo,
        messages: nextMessages,
        isStreaming: false,
        error: null,
      });
      return next;
    });
  }, []);

  const getConversation = useCallback((id) => {
    return conversations.get(id) || { messages: [], isStreaming: false, error: null };
  }, [conversations]);

  const markMulticaConnected = useCallback((conversationId) => {
    if (!conversationId) return;
    setConversations((prev) => {
      const next = new Map(prev);
      const convo = next.get(conversationId) || { messages: [], isStreaming: false, error: null };
      if (convo.multicaConnected) return prev;
      // transient — resets per-session; stripped in buildPersistedConversationSnapshot
      next.set(conversationId, { ...convo, multicaConnected: true });
      return next;
    });
  }, []);

  return {
    conversations,
    getConversation,
    prepareMessage,
    appendLocalMessages,
    startPreparedMessage,
    cancelMessage,
    editAndResend,
    loadMessages,
    replaceMessages,
    markMulticaConnected,
  };
}
