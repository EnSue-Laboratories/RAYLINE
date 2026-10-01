/**
 * Codex `exec --json` events plus the legacy rollout events
 * (`session_meta`, `event_msg`, `response_item`) applied to a draft.
 */
import type {
  CodexEventMsgEvent,
  CodexItemEvent,
  CodexResponseContentItem,
  CodexResponseItemEvent,
  CodexTurnCompletedEvent,
} from "@shared/agent/events";
import type { ToolPart } from "@shared/chat/types";
import {
  asToolPart,
  buildImagePartFromOpenAIBlock,
  editLastAssistant,
  editTrailingAssistant,
  ensureAssistantIndex,
  finalizeAssistant,
  findToolPartIndex,
  isRecord,
} from "./assistant";
import type { ConversationDraft } from "./draft";
import { uid } from "./ids";
import { mergeUsage, normalizeCodexRateLimits, normalizeCodexUsage } from "./usage";

function extractResponseText(content: readonly CodexResponseContentItem[] | undefined): string {
  if (!content) return "";
  let text = "";
  for (const item of content) {
    if (item?.type === "output_text" && typeof item.text === "string") text += item.text;
  }
  return text;
}

/** Codex tool arguments: an object, a JSON string, or a raw string payload. */
export function normalizeCodexToolArgs(payload: { type: string; arguments?: unknown; input?: unknown }): Record<string, unknown> {
  const raw = payload.arguments ?? payload.input;
  if (raw == null) return {};
  const withCommand = (value: Record<string, unknown>): Record<string, unknown> =>
    value.cmd && !value.command ? { ...value, command: value.cmd } : value;
  if (isRecord(raw)) return withCommand(raw);
  if (typeof raw !== "string") return { value: raw };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isRecord(parsed)) return withCommand(parsed);
  } catch {
    // Fall through to the raw string payload shape below.
  }
  return payload.type === "custom_tool_call" ? { input: raw } : { value: raw };
}

/** Tool output that looks like JSON is parsed; anything else is kept verbatim. */
export function normalizeCodexToolResult(output: unknown): unknown {
  if (typeof output !== "string") return output;
  const trimmed = output.trim();
  if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) return output;
  try {
    return JSON.parse(output) as unknown;
  } catch {
    return output;
  }
}

export function applyCodexEventMsg(draft: ConversationDraft, event: CodexEventMsgEvent): void {
  draft.touch();
  const payload = event.payload;
  switch (payload?.type) {
    case "token_count": {
      const info = payload.info;
      const usage = normalizeCodexUsage(info?.last_token_usage || info?.total_token_usage, info?.model_context_window);
      const rateLimits = normalizeCodexRateLimits(payload.rate_limits);
      if (!usage && !rateLimits) return;
      const message = editLastAssistant(draft);
      if (usage) message._usage = usage;
      if (rateLimits) message._rateLimits = rateLimits;
      return;
    }
    case "task_started": {
      const index = ensureAssistantIndex(draft);
      const contextWindow = payload.model_context_window;
      if (typeof contextWindow !== "number" || !Number.isFinite(contextWindow)) return;
      const message = draft.editAssistant(index);
      if (message) message._usage = mergeUsage(message._usage, { context_window: contextWindow });
      return;
    }
    case "task_complete": {
      const message = editLastAssistant(draft);
      const completionText = payload.last_agent_message;
      const hasText = (message.parts ?? []).some((part) => part.type === "text" && part.text);
      if (!hasText && completionText) draft.editParts(message).push(draft.own({ type: "text", text: completionText }));
      finalizeAssistant(message);
      draft.set("isStreaming", false);
      return;
    }
    default:
      return;
  }
}

function upsertCommandTool(draft: ConversationDraft, event: CodexItemEvent): void {
  const item = event.item;
  if (item.type !== "command_execution") return;
  const message = editLastAssistant(draft);
  if (event.type === "item.started") {
    const tool: ToolPart = { type: "tool", id: item.id || uid(), name: item.command || "command", args: { command: item.command }, result: null, status: "running" };
    draft.editParts(message).push(draft.own(tool));
    return;
  }
  const existing = findToolPartIndex(message.parts ?? [], item.id);
  const part = asToolPart(existing >= 0 ? draft.editPart(message, existing) : undefined);
  if (part) {
    part.result = item.aggregated_output;
    part.status = "done";
    return;
  }
  const tool: ToolPart = { type: "tool", id: item.id || uid(), name: item.command || "command", args: { command: item.command }, result: item.aggregated_output, status: "done" };
  draft.editParts(message).push(draft.own(tool));
}

export function applyCodexItem(draft: ConversationDraft, event: CodexItemEvent): void {
  draft.touch();
  const item: CodexItemEvent["item"] | undefined = event.item;
  if (!item) return;
  if (event.type === "item.started") {
    upsertCommandTool(draft, event);
  } else if (event.type === "item.completed") {
    if (item.type === "agent_message") {
      const message = editLastAssistant(draft);
      draft.editParts(message).push(draft.own({ type: "text", text: item.text || "" }));
    } else {
      upsertCommandTool(draft, event);
    }
  }
}

export function applyCodexResponseItem(draft: ConversationDraft, event: CodexResponseItemEvent): void {
  draft.touch();
  const payload = event.payload;
  switch (payload?.type) {
    case "message": {
      if (payload.role !== "assistant") return;
      const text = extractResponseText(payload.content);
      const images = Array.isArray(payload.content)
        ? payload.content.map(buildImagePartFromOpenAIBlock).filter((part) => part !== null)
        : [];
      if (!text && images.length === 0) return;
      const message = editLastAssistant(draft);
      const parts = draft.editParts(message);
      if (text) parts.push(draft.own({ type: "text", text }));
      for (const image of images) parts.push(draft.own(image));
      return;
    }
    case "function_call":
    case "custom_tool_call": {
      const message = editLastAssistant(draft);
      const toolId = payload.call_id || uid();
      const existingIndex = findToolPartIndex(message.parts ?? [], toolId);
      const existing = asToolPart(existingIndex >= 0 ? draft.editPart(message, existingIndex) : undefined);
      const name = payload.name || "tool";
      const args = normalizeCodexToolArgs(payload);
      const status = payload.status === "completed" ? "done" : "running";
      if (existing) {
        Object.assign(existing, { type: "tool", id: toolId, name, args, result: existing.result, status });
      } else {
        draft.editParts(message).push(draft.own<ToolPart>({ type: "tool", id: toolId, name, args, result: null, status }));
      }
      return;
    }
    case "function_call_output":
    case "custom_tool_call_output": {
      const message = editLastAssistant(draft);
      const existingIndex = findToolPartIndex(message.parts ?? [], payload.call_id);
      const existing = asToolPart(existingIndex >= 0 ? draft.editPart(message, existingIndex) : undefined);
      const result = normalizeCodexToolResult(payload.output);
      if (existing) {
        existing.result = result;
        existing.status = "done";
      } else {
        draft.editParts(message).push(draft.own<ToolPart>({ type: "tool", id: payload.call_id || uid(), name: "tool", args: {}, result, status: "done" }));
      }
      return;
    }
    default:
      return;
  }
}

/**
 * Live Codex stdout still uses `turn.completed` with a coarse usage packet;
 * merge it as an immediate fallback so the footer renders before session-file
 * hydration.
 */
export function applyCodexTurnCompleted(draft: ConversationDraft, event: CodexTurnCompletedEvent): void {
  const message = editTrailingAssistant(draft);
  if (message) {
    const fallbackUsage = normalizeCodexUsage(event.usage);
    if (fallbackUsage) message._usage = mergeUsage(message._usage, fallbackUsage);
    finalizeAssistant(message);
  }
  draft.set("isStreaming", false);
}
