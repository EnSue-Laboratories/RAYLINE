/**
 * Pure translation between the OpenAI Responses API (what Codex speaks) and
 * Chat Completions (what many OpenAI-compatible upstreams only implement).
 * Used by the local Codex upstream bridge.
 */

import crypto from "node:crypto";
import { isRecord, readNumber, readRecord, readString, safeString, type JsonRecord } from "../common/json";

export type ChatContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

export interface ChatToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export type ChatMessage =
  | { role: "system" | "user" | "assistant" | "tool"; content: string | ChatContentPart[] }
  | { role: "assistant"; content: null; tool_calls: ChatToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export interface ChatTool {
  type: "function";
  function: { name: string; description: string; parameters: unknown; strict?: boolean };
}

export interface ChatRequestBody {
  model: unknown;
  messages: ChatMessage[];
  stream: boolean;
  tools?: ChatTool[];
  tool_choice?: unknown;
  parallel_tool_calls?: boolean;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stream_options?: { include_usage: true };
}

export interface ResponsesUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  input_tokens_details: { cached_tokens: number };
}

export interface ResponsesMessageItem {
  id: string;
  type: "message";
  status: "in_progress" | "completed";
  role: "assistant";
  content: { type: "output_text"; text: string; annotations: unknown[] }[];
}

export interface ResponsesFunctionCallItem {
  id: string;
  type: "function_call";
  status: "in_progress" | "completed";
  call_id: string;
  name: string;
  arguments: string;
}

export type ResponsesOutputItem = ResponsesMessageItem | ResponsesFunctionCallItem;

export interface ResponsesShell {
  id: string;
  object: "response";
  created_at: number;
  status: string;
  model: unknown;
  output: ResponsesOutputItem[];
  usage?: ResponsesUsage;
}

function stringifyArgs(value: unknown, fallback: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value ?? fallback);
}

export function responsesContentToChatContent(content: unknown): string | ChatContentPart[] {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  const parts: ChatContentPart[] = [];
  for (const item of content) {
    if (!isRecord(item)) continue;
    if (item.type === "input_text" || item.type === "output_text" || typeof item.text === "string") {
      parts.push({ type: "text", text: safeString(item.text) });
      continue;
    }
    const imageUrl = readString(item.image_url, "url") || readString(item, "image_url") || readString(item, "url");
    if (item.type === "input_image" && imageUrl) parts.push({ type: "image_url", image_url: { url: imageUrl } });
  }

  if (parts.some((part) => part.type === "image_url")) {
    return parts.filter((part) => part.type === "image_url" || part.text);
  }
  return parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .filter(Boolean)
    .join("\n");
}

function chatRole(role: unknown): "system" | "user" | "assistant" | "tool" {
  if (role === "assistant" || role === "tool" || role === "user") return role;
  return "system";
}

export function responsesInputToChatMessages(body: JsonRecord): ChatMessage[] {
  const messages: ChatMessage[] = [];
  const instructions = safeString(body.instructions);
  if (instructions) messages.push({ role: "system", content: instructions });

  const input: unknown[] = Array.isArray(body.input) ? body.input : [{ type: "message", role: "user", content: body.input || "" }];
  for (const item of input) {
    if (!isRecord(item)) continue;
    if (item.type === "message") {
      messages.push({ role: chatRole(item.role), content: responsesContentToChatContent(item.content) });
    } else if (item.type === "function_call") {
      messages.push({
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: safeString(item.call_id) || safeString(item.id) || `call_${messages.length}`,
            type: "function",
            function: { name: safeString(item.name) || "tool", arguments: stringifyArgs(item.arguments, {}) },
          },
        ],
      });
    } else if (item.type === "function_call_output") {
      messages.push({
        role: "tool",
        tool_call_id: safeString(item.call_id) || safeString(item.id),
        content: stringifyArgs(item.output, ""),
      });
    }
  }
  return messages;
}

export function responsesToolsToChatTools(tools: unknown): ChatTool[] | undefined {
  if (!Array.isArray(tools)) return undefined;
  const converted: ChatTool[] = [];
  for (const tool of tools) {
    const name = readString(tool, "name");
    if (!isRecord(tool) || tool.type !== "function" || !name) continue;
    converted.push({
      type: "function",
      function: {
        name,
        description: typeof tool.description === "string" ? tool.description : "",
        parameters: tool.parameters || { type: "object", properties: {} },
        ...(typeof tool.strict === "boolean" ? { strict: tool.strict } : {}),
      },
    });
  }
  return converted.length ? converted : undefined;
}

export function buildChatRequestBody(body: JsonRecord): ChatRequestBody {
  const chatBody: ChatRequestBody = {
    model: body.model,
    messages: responsesInputToChatMessages(body),
    stream: Boolean(body.stream),
  };
  const tools = responsesToolsToChatTools(body.tools);
  if (tools) {
    chatBody.tools = tools;
    if (body.tool_choice) chatBody.tool_choice = body.tool_choice;
    if (typeof body.parallel_tool_calls === "boolean") chatBody.parallel_tool_calls = body.parallel_tool_calls;
  }
  if (typeof body.temperature === "number") chatBody.temperature = body.temperature;
  if (typeof body.top_p === "number") chatBody.top_p = body.top_p;
  const maxOutput = readNumber(body, "max_output_tokens");
  if (maxOutput !== undefined) chatBody.max_tokens = maxOutput;
  if (chatBody.stream) chatBody.stream_options = { include_usage: true };
  return chatBody;
}

export function createResponseShell(
  body: JsonRecord,
  status = "in_progress",
  output: ResponsesOutputItem[] = [],
  usage?: ResponsesUsage,
): ResponsesShell {
  return {
    id: `resp_${crypto.randomUUID()}`,
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    status,
    model: body.model,
    output,
    ...(usage ? { usage } : {}),
  };
}

export function chatUsageToResponsesUsage(usage: unknown): ResponsesUsage | undefined {
  if (!isRecord(usage)) return undefined;
  const inputTokens = readNumber(usage, "prompt_tokens") ?? readNumber(usage, "input_tokens") ?? 0;
  const outputTokens = readNumber(usage, "completion_tokens") ?? readNumber(usage, "output_tokens") ?? 0;
  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: readNumber(usage, "total_tokens") ?? inputTokens + outputTokens,
    input_tokens_details: {
      cached_tokens:
        readNumber(readRecord(usage, "prompt_tokens_details"), "cached_tokens") ??
        readNumber(readRecord(usage, "input_tokens_details"), "cached_tokens") ??
        0,
    },
  };
}

export function chatMessageToResponseOutput(message: unknown): ResponsesOutputItem[] {
  const output: ResponsesOutputItem[] = [];
  const text = safeString(readString(message, "content"));
  if (text) {
    output.push({
      id: `msg_${crypto.randomUUID()}`,
      type: "message",
      status: "completed",
      role: "assistant",
      content: [{ type: "output_text", text, annotations: [] }],
    });
  }
  const toolCalls: unknown[] = isRecord(message) && Array.isArray(message.tool_calls) ? message.tool_calls : [];
  for (const toolCall of toolCalls) {
    const fn = readRecord(toolCall, "function");
    output.push({
      id: safeString(readString(toolCall, "id")) || `fc_${crypto.randomUUID()}`,
      type: "function_call",
      status: "completed",
      call_id: safeString(readString(toolCall, "id")) || `call_${crypto.randomUUID()}`,
      name: safeString(readString(fn, "name")) || "tool",
      arguments: readString(fn, "arguments") ?? "{}",
    });
  }
  return output;
}

export function chatCompletionToResponse(body: JsonRecord, chatCompletion: unknown): ResponsesShell {
  const choices: unknown[] = isRecord(chatCompletion) && Array.isArray(chatCompletion.choices) ? chatCompletion.choices : [];
  const message = readRecord(choices[0], "message") ?? {};
  return createResponseShell(
    body,
    "completed",
    chatMessageToResponseOutput(message),
    chatUsageToResponsesUsage(readRecord(chatCompletion, "usage")),
  );
}

/** Should a failed `/responses` call fall back to `/chat/completions`? */
export function shouldFallbackResponses(status: number, text: string): boolean {
  if (status === 404) return true;
  return /not implemented|convert_request_failed|responses?.*(unsupported|not supported|not implemented)|unsupported.*responses?/i.test(text || "");
}

export function parseSseBlock(block: string): { event: string; data: string } {
  const eventLines: string[] = [];
  const dataLines: string[] = [];
  for (const rawLine of block.split("\n")) {
    const line = rawLine.trimEnd();
    if (line.startsWith("event:")) eventLines.push(line.slice(6).trimStart());
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  return { event: eventLines[eventLines.length - 1] || "", data: dataLines.join("\n") };
}
