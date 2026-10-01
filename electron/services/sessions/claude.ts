/**
 * Pure parsing of Claude CLI session JSONL (`~/.claude/projects/<dir>/<id>.jsonl`).
 * No I/O: callers stream events in and read the result out.
 */

import type { AssistantMessage, ChatMessage, MessagePart, ToolPart } from "@shared/chat/types";
import {
  SKILL_PREAMBLE,
  SYSTEM_REMINDER_RE,
  asRecord,
  getRecord,
  getString,
  isRecord,
  localId,
  type RawRecord,
} from "./raw";

/** Lines scanned for the session cwd (matches the legacy reader). */
export const CLAUDE_CWD_SCAN_LINES = 200;
/** Lines scanned for a session title in `listSessions`. */
export const CLAUDE_TITLE_SCAN_LINES = 50;
export const TITLE_MAX_CHARS = 60;

/** `cwd` recorded on a Claude event, if any. */
export function claudeEventCwd(evt: unknown): string | null {
  const cwd = isRecord(evt) ? evt.cwd : undefined;
  return typeof cwd === "string" && cwd ? cwd : null;
}

function stripReminders(text: string): string {
  return text.replace(SYSTEM_REMINDER_RE, "").trim();
}

/** Title candidate from one head line, or null to keep scanning. */
export function claudeTitleFromEvent(evt: unknown): string | null {
  const record = asRecord(evt);
  if (!record) return null;
  const isUser = record.type === "user" || (record.role === "user" && record.type === "message");
  if (!isUser) return null;

  const message = getRecord(record, "message");
  const content = message?.content;
  const text: unknown = (content || record.text || record.display) ?? "";

  if (typeof text === "string" && text.length > 0 && !text.startsWith(SKILL_PREAMBLE)) {
    const cleaned = stripReminders(text);
    if (cleaned) return cleaned.slice(0, TITLE_MAX_CHARS);
  }
  if (Array.isArray(text)) {
    for (const block of text as unknown[]) {
      const b = asRecord(block);
      const blockText = getString(b, "text");
      if (b?.type !== "text" || !blockText || blockText.startsWith(SKILL_PREAMBLE)) continue;
      const cleaned = stripReminders(blockText);
      return cleaned ? cleaned.slice(0, TITLE_MAX_CHARS) : null;
    }
  }
  return null;
}

function userTextFrom(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  let text = "";
  for (const block of content as unknown[]) {
    const b = asRecord(block);
    if (b?.type === "text") text += getString(b, "text") ?? "";
  }
  return text;
}

function hasToolResult(content: unknown): boolean {
  return Array.isArray(content) && (content as unknown[]).some((b) => asRecord(b)?.type === "tool_result");
}

function toolResultText(block: RawRecord): unknown {
  const content = block.content;
  return typeof content === "string" ? content : JSON.stringify(content);
}

function assistantPartsFrom(content: unknown): MessagePart[] {
  if (!Array.isArray(content)) return [];
  const parts: MessagePart[] = [];
  for (const block of content as unknown[]) {
    const b = asRecord(block);
    if (!b) continue;
    const text = getString(b, "text");
    if (b.type === "text" && text) {
      parts.push({ type: "text", text });
    }
    if (b.type === "tool_use") {
      const tool: ToolPart = {
        type: "tool",
        id: getString(b, "id") || localId("tc"),
        name: getString(b, "name") || "unknown",
        args: asRecord(b.input) ?? {},
        result: null,
        status: "done",
      };
      parts.push(tool);
    }
  }
  return parts;
}

export interface ClaudeSessionParser {
  push(evt: unknown): void;
  /** Messages with tool results linked, trimmed to the last `maxMessages`. */
  finish(maxMessages: number): ChatMessage[];
}

/**
 * Single-pass replacement for the legacy two-pass parse: tool results are
 * collected by `tool_use_id` while streaming and linked at the end (last
 * result wins, as before).
 */
export function createClaudeSessionParser(): ClaudeSessionParser {
  const messages: ChatMessage[] = [];
  const toolResults = new Map<string, unknown>();

  const pushUser = (record: RawRecord): void => {
    const content = getRecord(record, "message")?.content;
    if (Array.isArray(content)) {
      for (const block of content as unknown[]) {
        const b = asRecord(block);
        const toolUseId = getString(b, "tool_use_id");
        if (b && b.type === "tool_result" && toolUseId) toolResults.set(toolUseId, toolResultText(b));
      }
    }

    let text = userTextFrom(content);
    if (text.startsWith(SKILL_PREAMBLE)) text = "";
    text = stripReminders(text);
    if (!text || hasToolResult(content)) return;
    messages.push({ id: getString(record, "uuid") || localId("u"), role: "user", text });
  };

  const pushAssistant = (record: RawRecord): void => {
    const newParts = assistantPartsFrom(getRecord(record, "message")?.content);
    if (newParts.length === 0) return;
    const last = messages[messages.length - 1];
    if (last?.role === "assistant") {
      last.parts = [...(last.parts ?? []), ...newParts];
      return;
    }
    const message: AssistantMessage = {
      id: getString(record, "uuid") || localId("a"),
      role: "assistant",
      parts: newParts,
      isStreaming: false,
      isThinking: false,
    };
    messages.push(message);
  };

  return {
    push(evt) {
      const record = asRecord(evt);
      if (record?.type === "user") pushUser(record);
      else if (record?.type === "assistant") pushAssistant(record);
    },
    finish(maxMessages) {
      const result = limitMessages(messages, maxMessages);
      if (toolResults.size === 0) return result;
      for (const msg of result) {
        if (msg.role !== "assistant" || !msg.parts) continue;
        // Legacy semantics: each result fills the first matching tool part
        // of every assistant message.
        const filled = new Set<string>();
        for (const part of msg.parts) {
          if (part.type !== "tool" || filled.has(part.id) || !toolResults.has(part.id)) continue;
          filled.add(part.id);
          part.result = toolResults.get(part.id);
          part.status = "done";
        }
      }
      return result;
    },
  };
}

export function limitMessages<T>(messages: T[], maxMessages: number): T[] {
  if (!Number.isFinite(maxMessages) || maxMessages <= 0) return messages;
  return messages.length > maxMessages ? messages.slice(-maxMessages) : messages;
}
