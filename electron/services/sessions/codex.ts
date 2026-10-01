/**
 * Pure parsing of Codex CLI rollout JSONL (`~/.codex/sessions/YYYY/MM/DD/rollout-*-<id>.jsonl`).
 */

import type { RateLimitWindow, RateLimits, TokenUsage } from "@shared/agent/usage";
import type { AssistantMessage, ChatMessage, TextPart } from "@shared/chat/types";
import { limitMessages, TITLE_MAX_CHARS } from "./claude";
import { asRecord, getArray, getRecord, getString, isFiniteNumber, localId, type RawRecord } from "./raw";

export const CODEX_TITLE_SCAN_LINES = 100;
const CODEX_USER_PROMPT_MARKER = "--- USER PROMPT ---";
const SYSTEM_CONTEXT_PREFIX = "System context for this run:";

const UUID_SUFFIX_RE = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i;

/** Thread id embedded at the end of a rollout file name, if any. */
export function codexThreadIdFromFileName(fileName: string): string | null {
  return UUID_SUFFIX_RE.exec(fileName)?.[1]?.toLowerCase() ?? null;
}

export function stripCodexSystemContext(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith(SYSTEM_CONTEXT_PREFIX)) return trimmed;
  const markerIndex = trimmed.indexOf(CODEX_USER_PROMPT_MARKER);
  if (markerIndex === -1) return trimmed;
  return trimmed.slice(markerIndex + CODEX_USER_PROMPT_MARKER.length).trim();
}

function stripCodexImagePreamble(text: string): string {
  return text.replace(/^(?:<image\b[^>]*><\/image>\s*)+/i, "").trim();
}

export function cleanCodexUserMessage(text: string): string {
  const cleaned = stripCodexImagePreamble(stripCodexSystemContext(stripCodexImagePreamble(text)));
  if (!cleaned || cleaned.startsWith("<environment_context>")) return "";
  return cleaned;
}

function joinBlocks(content: unknown, blockType: string): string {
  if (!Array.isArray(content)) return "";
  let text = "";
  for (const block of content as unknown[]) {
    const b = asRecord(block);
    const blockText = getString(b, "text");
    if (b?.type === blockType && blockText) text += blockText;
  }
  return text;
}

function numberOr<T>(value: unknown, fallback: T): number | T {
  return typeof value === "number" ? value : fallback;
}

function usageFrom(usage: RawRecord, contextWindow: unknown): TokenUsage {
  return {
    input_tokens: numberOr(usage.input_tokens, 0),
    output_tokens: numberOr(usage.output_tokens, 0),
    total_tokens: numberOr(usage.total_tokens, null),
    cache_read_input_tokens: numberOr(usage.cached_input_tokens, numberOr(usage.cache_read_input_tokens, 0)),
    cache_creation_input_tokens: numberOr(usage.cache_creation_input_tokens, 0),
    ...(isFiniteNumber(contextWindow) ? { context_window: contextWindow } : {}),
  };
}

export function normalizeCodexUsageSnapshot(info: RawRecord | null): TokenUsage | null {
  const usage = getRecord(info, "last_token_usage") ?? getRecord(info, "total_token_usage");
  return usage ? usageFrom(usage, info?.model_context_window) : null;
}

function pickWindow(value: unknown): RateLimitWindow | null {
  const window = asRecord(value);
  if (!window || !isFiniteNumber(window.used_percent)) return null;
  return {
    used_percent: window.used_percent,
    resets_at: isFiniteNumber(window.resets_at) ? window.resets_at : null,
    window_minutes: isFiniteNumber(window.window_minutes) ? window.window_minutes : null,
  };
}

export function normalizeCodexRateLimitsSnapshot(value: unknown): RateLimits | null {
  const rateLimits = asRecord(value);
  if (!rateLimits) return null;
  const five = pickWindow(rateLimits.primary);
  const seven = pickWindow(rateLimits.secondary);
  if (!five && !seven) return null;
  const planType = getString(rateLimits, "plan_type");
  return {
    ...(five ? { five_hour: five } : {}),
    ...(seven ? { seven_day: seven } : {}),
    ...(planType ? { plan_type: planType } : {}),
  };
}

/** `session_meta` header (first line) of a rollout file. */
export interface CodexSessionMeta {
  id: string | null;
  cwd: string | null;
}

export function parseCodexSessionMeta(evt: unknown): CodexSessionMeta | null {
  const record = asRecord(evt);
  if (record?.type !== "session_meta") return null;
  const payload = getRecord(record, "payload");
  return { id: getString(payload, "id") ?? null, cwd: getString(payload, "cwd") ?? null };
}

/** Title candidate from one head line (first real user prompt), or null. */
export function codexTitleFromEvent(evt: unknown): string | null {
  const record = asRecord(evt);
  const payload = getRecord(record, "payload");
  if (record?.type !== "response_item" || payload?.role !== "user") return null;
  const trimmed = stripCodexSystemContext(joinBlocks(payload.content, "input_text"));
  if (trimmed && !trimmed.startsWith("<") && !trimmed.startsWith("#")) return trimmed.slice(0, TITLE_MAX_CHARS);
  return null;
}

export interface CodexSessionResult {
  messages: ChatMessage[];
  cwd: string | null;
  usageSnapshot: TokenUsage | null;
  rateLimitsSnapshot: RateLimits | null;
}

export interface CodexSessionParser {
  push(evt: unknown): void;
  finish(maxMessages: number): CodexSessionResult;
}

export function createCodexSessionParser(): CodexSessionParser {
  const messages: ChatMessage[] = [];
  let sessionCwd: string | null = null;
  let usageSnapshot: TokenUsage | null = null;
  let rateLimitsSnapshot: RateLimits | null = null;
  let modelContextWindow: number | null = null;

  const appendUser = (text: string): void => {
    const cleaned = cleanCodexUserMessage(text);
    if (!cleaned) return;
    const last = messages[messages.length - 1];
    if (last?.role === "user" && last.text === cleaned) return;
    messages.push({ id: localId("u"), role: "user", text: cleaned });
  };

  const appendAssistantText = (text: string): void => {
    const part: TextPart = { type: "text", text };
    const last = messages[messages.length - 1];
    if (last?.role === "assistant") {
      (last.parts ??= []).push(part);
      return;
    }
    messages.push({ id: localId("a"), role: "assistant", parts: [part], isStreaming: false, isThinking: false });
  };

  const handleEventMsg = (payload: RawRecord | null): void => {
    if (!payload) return;
    if (payload.type === "task_started" && isFiniteNumber(payload.model_context_window)) {
      modelContextWindow = payload.model_context_window;
    }
    if (payload.type === "token_count") {
      const info = getRecord(payload, "info");
      if (info) {
        usageSnapshot = normalizeCodexUsageSnapshot(info) ?? usageSnapshot;
        if (isFiniteNumber(info.model_context_window)) modelContextWindow = info.model_context_window;
      }
      if (payload.rate_limits) {
        rateLimitsSnapshot = normalizeCodexRateLimitsSnapshot(payload.rate_limits) ?? rateLimitsSnapshot;
      }
    }
    const message = getString(payload, "message");
    if (payload.type === "user_message" && message !== undefined) appendUser(message);
  };

  return {
    push(evt) {
      const record = asRecord(evt);
      if (!record) return;
      const payload = getRecord(record, "payload");

      if (record.type === "session_meta" && payload?.cwd) {
        sessionCwd = getString(payload, "cwd") ?? sessionCwd;
        return;
      }
      if (record.type === "event_msg") {
        handleEventMsg(payload);
        return;
      }
      const legacyUsage = getRecord(record, "usage");
      if (record.type === "turn.completed" && !usageSnapshot && legacyUsage) {
        usageSnapshot = usageFrom(legacyUsage, modelContextWindow);
      }
      if (record.type !== "response_item") return;
      if (payload?.role === "user") {
        appendUser(joinBlocks(getArray(payload, "content"), "input_text"));
      } else if (payload?.type === "message" && payload.role === "assistant") {
        const text = joinBlocks(getArray(payload, "content"), "output_text");
        if (text) appendAssistantText(text);
      }
    },
    finish(maxMessages) {
      const result = limitMessages(messages, maxMessages);
      if (usageSnapshot || rateLimitsSnapshot) {
        for (let i = result.length - 1; i >= 0; i -= 1) {
          const msg = result[i];
          if (msg?.role !== "assistant") continue;
          const withUsage: AssistantMessage = {
            ...msg,
            ...(usageSnapshot ? { _usage: usageSnapshot } : {}),
            ...(rateLimitsSnapshot ? { _rateLimits: rateLimitsSnapshot } : {}),
          };
          result[i] = withUsage;
          break;
        }
      }
      return { messages: result, cwd: sessionCwd, usageSnapshot, rateLimitsSnapshot };
    },
  };
}
