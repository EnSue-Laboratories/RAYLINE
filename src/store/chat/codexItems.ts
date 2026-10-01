/**
 * Codex `exec --json` thread items (`item.started` / `item.updated` /
 * `item.completed`) → message parts, upserted by item id so repeated events
 * for one item update a single part.
 *
 * `error` items are non-fatal notices (e.g. "Skill descriptions were
 * shortened…") inside a turn that still succeeds: they render as a muted
 * status part, never as a failure. Failures are `turn.failed`, top-level
 * `error` and `agent-error`.
 */
import type { CodexItemEvent, CodexThreadItem, CodexTodoListItem } from "@shared/agent/events";
import type { AssistantMessage, MessagePart, ToolPart, ToolStatus } from "@shared/chat/types";
import { asToolPart, editLastAssistant, isRecord } from "./assistant";
import type { ConversationDraft } from "./draft";
import { uid } from "./ids";

export const CODEX_NOTICE_KIND = "notice";
/** Stored title of a Codex notice; the renderer shows `chat.noticeTitle` instead. */
export const CODEX_NOTICE_TITLE = "Notice";

type ItemPhase = "started" | "updated" | "completed";

function phaseOf(event: CodexItemEvent): ItemPhase {
  return event.type === "item.started" ? "started" : event.type === "item.updated" ? "updated" : "completed";
}

function toolStatus(phase: ItemPhase, status: string | undefined): ToolStatus {
  if (phase === "completed") return "done";
  return status === "completed" || status === "failed" || status === "declined" ? "done" : "running";
}

function findPartById(parts: readonly MessagePart[], type: MessagePart["type"], id: string): number {
  return parts.findIndex((part) => part.type === type && "id" in part && part.id === id);
}

/** Insert or update the tool part for `id` (never touches other parts). */
function upsertTool(draft: ConversationDraft, message: AssistantMessage, id: string, patch: Omit<ToolPart, "type" | "id">): void {
  const index = findPartById(message.parts ?? [], "tool", id);
  const existing = asToolPart(index >= 0 ? draft.editPart(message, index) : undefined);
  if (existing) Object.assign(existing, patch);
  else draft.editParts(message).push(draft.own<ToolPart>({ type: "tool", id, ...patch }));
}

function upsertText(draft: ConversationDraft, message: AssistantMessage, type: "text" | "thinking", id: string, text: string): void {
  const index = findPartById(message.parts ?? [], type, id);
  const existing = index >= 0 ? draft.editPart(message, index) : undefined;
  if (existing && (existing.type === "text" || existing.type === "thinking")) existing.text = text;
  else draft.editParts(message).push(draft.own(type === "text" ? { type, id, text } : { type, id, text }));
}

function todoArgs(item: CodexTodoListItem): Record<string, unknown> {
  return { todos: (item.items ?? []).map((todo) => ({ content: todo.text, status: todo.completed ? "completed" : "pending" })) };
}

function mcpArgs(value: unknown): Record<string, unknown> {
  if (isRecord(value)) return value;
  return value == null ? {} : { value };
}

function applyItem(draft: ConversationDraft, message: AssistantMessage, item: CodexThreadItem, phase: ItemPhase): void {
  const id = item.id || uid();
  switch (item.type) {
    case "agent_message":
      if (phase !== "started" || item.text) upsertText(draft, message, "text", id, item.text || "");
      return;
    case "reasoning":
      if (item.text) upsertText(draft, message, "thinking", id, item.text);
      message.isThinking = phase !== "completed";
      return;
    case "command_execution": {
      const done = toolStatus(phase, item.status);
      upsertTool(draft, message, id, {
        name: item.command || "command",
        args: { command: item.command },
        result: phase === "started" && !item.aggregated_output ? null : item.aggregated_output,
        status: done,
      });
      return;
    }
    case "file_change": {
      const changes = item.changes ?? [];
      upsertTool(draft, message, id, {
        name: "Edit",
        args: { file_path: changes[0]?.path, changes },
        result: changes.length > 0 ? changes.map((change) => `${change.kind} ${change.path}`).join("\n") : null,
        status: toolStatus(phase, item.status),
      });
      return;
    }
    case "mcp_tool_call":
      upsertTool(draft, message, id, {
        name: `mcp__${item.server}__${item.tool}`,
        args: mcpArgs(item.arguments),
        result: item.error?.message ?? item.result ?? null,
        status: toolStatus(phase, item.status),
      });
      return;
    case "collab_tool_call":
      upsertTool(draft, message, id, {
        name: "Agent",
        args: { description: item.prompt ?? item.tool ?? "" },
        result: null,
        status: toolStatus(phase, item.status),
      });
      return;
    case "web_search":
      upsertTool(draft, message, id, { name: "WebSearch", args: { query: item.query }, result: null, status: phase === "completed" ? "done" : "running" });
      return;
    case "todo_list":
      upsertTool(draft, message, id, { name: "TodoWrite", args: todoArgs(item), result: null, status: phase === "completed" ? "done" : "running" });
      return;
    case "error": {
      if (!item.message) return;
      const parts = draft.editParts(message);
      const duplicate = parts.some((part) => part.type === "status" && part.kind === CODEX_NOTICE_KIND && part.text === item.message);
      if (!duplicate) parts.push(draft.own({ type: "status", kind: CODEX_NOTICE_KIND, title: CODEX_NOTICE_TITLE, text: item.message }));
      return;
    }
    default: {
      const unhandled: never = item;
      return unhandled;
    }
  }
}

export function applyCodexItem(draft: ConversationDraft, event: CodexItemEvent): void {
  draft.touch();
  const item: CodexThreadItem | undefined = event.item;
  if (!isRecord(item)) return;
  applyItem(draft, editLastAssistant(draft), item, phaseOf(event));
}
