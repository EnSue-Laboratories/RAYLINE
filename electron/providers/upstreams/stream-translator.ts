/**
 * Converts a Chat Completions SSE stream into Responses API SSE events
 * (`response.output_item.added`, `response.output_text.delta`, …) so Codex
 * can talk to chat-only upstreams. Pure: events go to the `emit` callback.
 */

import crypto from "node:crypto";
import { isRecord, readNumber, readRecord, readString, safeString, type JsonRecord } from "../common/json";
import {
  chatUsageToResponsesUsage,
  createResponseShell,
  type ResponsesFunctionCallItem,
  type ResponsesMessageItem,
  type ResponsesOutputItem,
  type ResponsesShell,
  type ResponsesUsage,
} from "./responses-chat";

export type SseEmitter = (event: string, data: unknown) => void;

type Indexed<T> = T & { output_index: number };

const EMPTY_USAGE: ResponsesUsage = { input_tokens: 0, output_tokens: 0, total_tokens: 0, input_tokens_details: { cached_tokens: 0 } };

function publicItem<T extends ResponsesOutputItem>(item: Indexed<T>): T {
  const { output_index: _outputIndex, ...rest } = item;
  // `rest` is exactly T without the bookkeeping index.
  return rest as unknown as T;
}

export class ResponsesStreamTranslator {
  private readonly base: ResponsesShell;
  private readonly output: Indexed<ResponsesOutputItem>[] = [];
  private readonly toolCalls = new Map<number, Indexed<ResponsesFunctionCallItem>>();
  private messageItem: Indexed<ResponsesMessageItem> | null = null;
  private messageText = "";
  private nextOutputIndex = 0;
  private usage: ResponsesUsage | null = null;

  constructor(
    body: JsonRecord,
    private readonly emit: SseEmitter,
  ) {
    this.base = createResponseShell(body);
  }

  start(): void {
    this.emit("response.created", { type: "response.created", response: this.base });
    this.emit("response.in_progress", { type: "response.in_progress", response: this.base });
  }

  /** Feeds one parsed `chat.completion.chunk`. */
  processChunk(chunk: unknown): void {
    if (!isRecord(chunk)) return;
    if (chunk.usage) this.usage = chatUsageToResponsesUsage(chunk.usage) ?? this.usage;
    const choices: unknown[] = Array.isArray(chunk.choices) ? chunk.choices : [];
    for (const choice of choices) {
      const delta = readRecord(choice, "delta") ?? {};
      if (typeof delta.content === "string") this.appendMessageDelta(delta.content);
      const toolDeltas: unknown[] = Array.isArray(delta.tool_calls) ? delta.tool_calls : [];
      for (const toolDelta of toolDeltas) if (isRecord(toolDelta)) this.appendToolDelta(toolDelta);
    }
  }

  /** Closes open items and emits `response.completed`. */
  finish(): void {
    this.finishOutputItems();
    const output = [...this.output].sort((a, b) => a.output_index - b.output_index).map(publicItem);
    this.emit("response.completed", {
      type: "response.completed",
      response: { ...this.base, status: "completed", output, usage: this.usage ?? EMPTY_USAGE },
    });
  }

  private ensureMessageItem(): Indexed<ResponsesMessageItem> {
    if (this.messageItem) return this.messageItem;
    const item: Indexed<ResponsesMessageItem> = {
      id: `msg_${crypto.randomUUID()}`,
      type: "message",
      status: "in_progress",
      role: "assistant",
      content: [],
      output_index: this.nextOutputIndex++,
    };
    this.messageItem = item;
    this.emit("response.output_item.added", { type: "response.output_item.added", output_index: item.output_index, item: publicItem(item) });
    this.emit("response.content_part.added", {
      type: "response.content_part.added",
      item_id: item.id,
      output_index: item.output_index,
      content_index: 0,
      part: { type: "output_text", text: "", annotations: [] },
    });
    return item;
  }

  private appendMessageDelta(delta: string): void {
    if (!delta) return;
    const item = this.ensureMessageItem();
    this.messageText += delta;
    this.emit("response.output_text.delta", {
      type: "response.output_text.delta",
      item_id: item.id,
      output_index: item.output_index,
      content_index: 0,
      delta,
    });
  }

  private ensureToolCall(index: number, delta: JsonRecord): Indexed<ResponsesFunctionCallItem> {
    const existing = this.toolCalls.get(index);
    if (existing) return existing;
    const item: Indexed<ResponsesFunctionCallItem> = {
      id: `fc_${crypto.randomUUID()}`,
      type: "function_call",
      status: "in_progress",
      call_id: safeString(delta.id) || `call_${crypto.randomUUID()}`,
      name: safeString(readString(readRecord(delta, "function"), "name")) || "tool",
      arguments: "",
      output_index: this.nextOutputIndex++,
    };
    this.toolCalls.set(index, item);
    this.emit("response.output_item.added", { type: "response.output_item.added", output_index: item.output_index, item: publicItem(item) });
    return item;
  }

  private appendToolDelta(delta: JsonRecord): void {
    const item = this.ensureToolCall(readNumber(delta, "index") ?? 0, delta);
    const fn = readRecord(delta, "function");
    const name = readString(fn, "name");
    if (name) item.name = name;
    const args = readString(fn, "arguments");
    if (args) {
      item.arguments += args;
      this.emit("response.function_call_arguments.delta", {
        type: "response.function_call_arguments.delta",
        item_id: item.id,
        output_index: item.output_index,
        delta: args,
      });
    }
  }

  private finishOutputItems(): void {
    if (this.messageItem) {
      const completed: Indexed<ResponsesMessageItem> = {
        ...this.messageItem,
        status: "completed",
        content: [{ type: "output_text", text: this.messageText, annotations: [] }],
      };
      const ids = { item_id: completed.id, output_index: completed.output_index };
      this.emit("response.output_text.done", { type: "response.output_text.done", ...ids, content_index: 0, text: this.messageText });
      this.emit("response.content_part.done", { type: "response.content_part.done", ...ids, content_index: 0, part: completed.content[0] });
      this.emit("response.output_item.done", { type: "response.output_item.done", output_index: completed.output_index, item: publicItem(completed) });
      this.output.push(completed);
      this.messageItem = null;
    }

    for (const item of [...this.toolCalls.values()].sort((a, b) => a.output_index - b.output_index)) {
      const completed: Indexed<ResponsesFunctionCallItem> = { ...item, status: "completed" };
      this.emit("response.function_call_arguments.done", {
        type: "response.function_call_arguments.done",
        item_id: completed.id,
        output_index: completed.output_index,
        arguments: completed.arguments,
      });
      this.emit("response.output_item.done", { type: "response.output_item.done", output_index: completed.output_index, item: publicItem(completed) });
      this.output.push(completed);
    }
    this.toolCalls.clear();
  }
}
