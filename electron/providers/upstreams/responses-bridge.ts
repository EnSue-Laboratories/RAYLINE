/**
 * Local HTTP bridge between Codex (Responses API) and a user-configured
 * OpenAI-compatible upstream. Proxies `/responses` verbatim when the upstream
 * supports it, otherwise falls back to `/chat/completions` and translates.
 */

import crypto from "node:crypto";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import type { ProviderUpstreamConfig } from "@shared/providers/types";
import { errorMessage, isRecord, safeJsonParse, type JsonRecord } from "../common/json";
import { joinOpenAIPath, normalizeOpenAIBaseURL, normalizeProviderUpstreamConfig } from "./config";
import { buildChatRequestBody, chatCompletionToResponse, parseSseBlock, shouldFallbackResponses } from "./responses-chat";
import { ResponsesStreamTranslator } from "./stream-translator";

const MAX_REQUEST_BYTES = 25 * 1024 * 1024;

export interface CodexResponsesBridge {
  apiKey: string;
  /** `http://127.0.0.1:<port>/v1` */
  baseURL: string;
  targetBaseURL: string;
  close: () => void;
}

function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => {
      body += chunk;
      if (body.length > MAX_REQUEST_BYTES) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.writeHead(statusCode, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

function sendSse(res: ServerResponse, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function upstreamHeaders(req: IncomingMessage, config: ProviderUpstreamConfig, extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { "content-type": "application/json", ...extra };
  if (config.apiKey) headers.authorization = `Bearer ${config.apiKey}`;
  else if (req.headers.authorization) headers.authorization = req.headers.authorization;
  return headers;
}

/** fetch() bodies are typed `ReadableStream<any>`; narrow chunks to bytes. */
async function* iterateBytes(stream: ReadableStream<unknown>): AsyncGenerator<Uint8Array> {
  const reader = stream.getReader();
  for (;;) {
    const result = await reader.read();
    if (result.done) return;
    if (result.value instanceof Uint8Array) yield result.value;
  }
}

async function passThrough(upstream: Response, res: ServerResponse): Promise<void> {
  res.writeHead(upstream.status, { "content-type": upstream.headers.get("content-type") || "application/json" });
  res.end(await upstream.text());
}

async function proxyReadable(upstream: Response, res: ServerResponse): Promise<void> {
  if (!upstream.body) {
    await passThrough(upstream, res);
    return;
  }
  res.writeHead(upstream.status, { "content-type": upstream.headers.get("content-type") || "application/json" });
  for await (const chunk of iterateBytes(upstream.body)) res.write(chunk);
  res.end();
}

async function handleChatJsonFallback(req: IncomingMessage, res: ServerResponse, config: ProviderUpstreamConfig, body: JsonRecord): Promise<void> {
  const chatResponse = await fetch(joinOpenAIPath(config.baseURL, "/chat/completions"), {
    method: "POST",
    headers: upstreamHeaders(req, config),
    body: JSON.stringify({ ...buildChatRequestBody(body), stream: false }),
  });
  if (!chatResponse.ok) {
    await passThrough(chatResponse, res);
    return;
  }
  const payload = safeJsonParse(await chatResponse.text());
  if (payload === undefined) {
    sendJson(res, 502, { error: { message: "Upstream returned invalid JSON" } });
    return;
  }
  sendJson(res, 200, chatCompletionToResponse(body, payload));
}

async function handleChatStreamFallback(req: IncomingMessage, res: ServerResponse, config: ProviderUpstreamConfig, body: JsonRecord): Promise<void> {
  const chatResponse = await fetch(joinOpenAIPath(config.baseURL, "/chat/completions"), {
    method: "POST",
    headers: upstreamHeaders(req, config, { accept: "text/event-stream" }),
    body: JSON.stringify(buildChatRequestBody({ ...body, stream: true })),
  });
  if (!chatResponse.ok || !chatResponse.body) {
    await passThrough(chatResponse, res);
    return;
  }

  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
  const translator = new ResponsesStreamTranslator(body, (event, data) => sendSse(res, event, data));
  translator.start();

  const processBlock = (block: string): void => {
    const parsed = parseSseBlock(block);
    if (!parsed.data || parsed.data === "[DONE]") return;
    const chunk = safeJsonParse(parsed.data);
    if (chunk !== undefined) translator.processChunk(chunk);
  };

  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of iterateBytes(chatResponse.body)) {
    buffer += decoder.decode(chunk, { stream: true }).replace(/\r\n/g, "\n");
    let index = buffer.indexOf("\n\n");
    while (index >= 0) {
      processBlock(buffer.slice(0, index));
      buffer = buffer.slice(index + 2);
      index = buffer.indexOf("\n\n");
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) processBlock(buffer);

  translator.finish();
  res.end();
}

export function startCodexResponsesBridge(input: unknown): Promise<CodexResponsesBridge | null> {
  const config = normalizeProviderUpstreamConfig(input, "codex");
  if (!config?.baseURL) return Promise.resolve(null);
  const bridgeConfig: ProviderUpstreamConfig = { ...config, baseURL: normalizeOpenAIBaseURL(config.baseURL) };
  const bridgeApiKey = `rayline-bridge-${crypto.randomBytes(18).toString("hex")}`;
  let responsesUnsupported = false;

  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (req.method !== "POST" || !new URL(req.url || "/", "http://127.0.0.1").pathname.endsWith("/responses")) {
      sendJson(res, 404, { error: { message: "Not found" } });
      return;
    }
    const rawBody = await readRequestBody(req);
    const parsedBody: unknown = rawBody ? JSON.parse(rawBody) : {};
    const body: JsonRecord = isRecord(parsedBody) ? parsedBody : {};

    if (!responsesUnsupported) {
      const upstream = await fetch(joinOpenAIPath(bridgeConfig.baseURL, "/responses"), {
        method: "POST",
        headers: upstreamHeaders(req, bridgeConfig, { accept: req.headers.accept || "application/json" }),
        body: JSON.stringify(body),
      });
      if (upstream.ok) {
        await proxyReadable(upstream, res);
        return;
      }
      const text = await upstream.text();
      if (!shouldFallbackResponses(upstream.status, text)) {
        res.writeHead(upstream.status, { "content-type": upstream.headers.get("content-type") || "application/json" });
        res.end(text);
        return;
      }
      responsesUnsupported = true;
    }

    if (body.stream || String(req.headers.accept || "").includes("text/event-stream")) {
      await handleChatStreamFallback(req, res, bridgeConfig, body);
    } else {
      await handleChatJsonFallback(req, res, bridgeConfig, body);
    }
  };

  const server = http.createServer((req, res) => {
    handle(req, res).catch((error: unknown) => {
      if (!res.headersSent) sendJson(res, 502, { error: { message: errorMessage(error) || "Codex upstream bridge failed" } });
      else res.end();
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        resolve(null);
        return;
      }
      resolve({
        apiKey: bridgeApiKey,
        baseURL: `http://127.0.0.1:${address.port}/v1`,
        targetBaseURL: bridgeConfig.baseURL,
        close: () => server.close(),
      });
    });
  });
}
