/** Multica WebSocket frames (`multica:<ws type>`) applied to a draft. */
import { getMulticaInnerType, type MulticaStreamEvent, type MulticaWsPayload } from "@shared/agent/events";
import type { AssistantMessage, MessagePart, ToolPart } from "@shared/chat/types";
import { buildErrorPart, editLastAssistant, freezeElapsed } from "./assistant";
import type { ConversationDraft } from "./draft";
import { uid } from "./ids";

/** `task:message` payload → the part shape Message renders (tool parts via ToolCallBlock). */
export function mapMulticaTaskMessage(payload: MulticaWsPayload): MessagePart | null {
  switch (payload.type) {
    case "text":
      return { type: "text", text: payload.content || "" };
    case "tool_use":
      return { type: "tool", id: `mt${uid()}`, name: payload.tool ?? "tool", args: payload.input || {}, result: null, status: "running" };
    case "tool_result":
      return { type: "tool", id: `mt${uid()}`, name: payload.tool ?? "tool", args: {}, result: payload.output || "", status: "done" };
    case "error":
      return buildErrorPart(payload.content || "error", "Multica error");
    default:
      return null;
  }
}

/**
 * Multica carries no tool_use_id: pair a tool_result with the most recent
 * still-running tool_use of the same name.
 */
export function findPendingMulticaToolIndex(parts: readonly MessagePart[], name: string | undefined): number {
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const part = parts[i];
    if (part?.type === "tool" && part.status === "running" && part.name === name) return i;
  }
  return -1;
}

/** Multica turns end without touching `isThinking` (it never sets it). */
function stopAssistant(message: AssistantMessage): void {
  message.isStreaming = false;
  freezeElapsed(message);
}

export function applyMulticaEvent(draft: ConversationDraft, event: MulticaStreamEvent): void {
  const inner = getMulticaInnerType(event);
  const payload: MulticaWsPayload = event.payload ?? {};
  // Transient (reset per session; stripped from persisted snapshots).
  const markConnected = (): void => {
    if (!draft.conversation.multicaConnected) draft.set("multicaConnected", true);
  };

  // No-op frames never create an assistant bubble (e.g. a user echo arriving
  // before any task:message).
  if (inner === "chat:message" && payload.role === "user") {
    markConnected();
    return;
  }
  if (inner === "agent:status") {
    draft.effects.push({ kind: "multica-agent-status", agent: payload.agent });
    markConnected();
    return;
  }

  switch (inner) {
    case "task:message": {
      const part = mapMulticaTaskMessage(payload);
      if (!part) {
        markConnected();
        return;
      }
      const message = editLastAssistant(draft);
      const pendingIndex = payload.type === "tool_result" ? findPendingMulticaToolIndex(message.parts ?? [], payload.tool) : -1;
      const pending = pendingIndex >= 0 ? draft.editPart(message, pendingIndex) : undefined;
      if (pending?.type === "tool") {
        const patch: Pick<ToolPart, "result" | "status"> = { result: payload.output || "", status: "done" };
        Object.assign(pending, patch);
      } else {
        draft.editParts(message).push(draft.own(part));
      }
      message.isStreaming = true;
      markConnected();
      draft.set("isStreaming", true);
      return;
    }
    case "chat:done":
    case "task:completed":
    case "task:cancelled": {
      stopAssistant(editLastAssistant(draft));
      markConnected();
      draft.set("isStreaming", false);
      if (inner === "task:cancelled") draft.set("error", null);
      return;
    }
    case "task:failed":
    case "error": {
      const message = editLastAssistant(draft);
      draft.editParts(message).push(draft.own(buildErrorPart(payload.message || payload.reason || inner, `Multica ${inner}`)));
      stopAssistant(message);
      markConnected();
      draft.set("isStreaming", false);
      draft.set("error", payload.message || inner);
      return;
    }
    default:
      markConnected();
      return;
  }
}
