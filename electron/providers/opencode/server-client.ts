/** HTTP / SSE client for a local `opencode serve` process. */

import type { ChildProcess } from "node:child_process";
import net from "node:net";
import type { Logger } from "../common/boundary";
import { safeJsonParse } from "../common/json";
import { extractSseData } from "./parser";

const SERVER_READY_TIMEOUT_MS = 8000;

export function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

export function withDirectoryQuery(url: string, directory: string | null | undefined): string {
  if (!directory) return url;
  return `${url}${url.includes("?") ? "&" : "?"}directory=${encodeURIComponent(directory)}`;
}

async function readResponseText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

export interface OpenCodeRequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
  directory?: string | null;
  signal?: AbortSignal;
}

/** JSON request against the server; resolves parsed JSON, raw text, or null. */
export async function openCodeRequest(baseUrl: string, route: string, options: OpenCodeRequestOptions = {}): Promise<unknown> {
  const { method = "GET", body, directory, signal } = options;
  const response = await fetch(withDirectoryQuery(`${baseUrl}${route}`, directory), {
    method,
    signal,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await readResponseText(response);
  if (!response.ok) throw new Error(text || `OpenCode server request failed: ${response.status}`);
  if (!text.trim()) return null;
  return safeJsonParse(text) ?? text;
}

/**
 * Resolves the server URL once `opencode serve` prints "listening on …"
 * (falls back to the requested port after 8 s); rejects if it exits first.
 */
export function waitForOpenCodeServerUrl(child: ChildProcess, isCancelled: () => boolean, fallbackPort: number, log: Logger): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let stdoutBuffer = "";

    const cleanup = (): void => {
      clearTimeout(timeout);
      child.stdout?.off("data", onStdout);
      child.off("error", onError);
      child.off("close", onClose);
    };
    const settle = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };
    const onStdout = (chunk: Buffer): void => {
      const text = chunk.toString();
      log("serve stdout:", text.trim());
      stdoutBuffer += text;
      const url = /listening on (https?:\/\/[^\s]+)/i.exec(stdoutBuffer)?.[1];
      if (url) settle(() => resolve(url));
    };
    const onError = (err: Error): void => settle(() => reject(err));
    const onClose = (code: number | null, signal: NodeJS.Signals | null): void => {
      const error = isCancelled() ? new Error("OpenCode server cancelled.") : new Error(`OpenCode server exited before ready: ${code ?? signal ?? "unknown"}`);
      settle(() => reject(error));
    };
    const timeout = setTimeout(() => settle(() => resolve(`http://127.0.0.1:${fallbackPort}`)), SERVER_READY_TIMEOUT_MS);

    child.stdout?.on("data", onStdout);
    child.once("error", onError);
    child.once("close", onClose);
  });
}

/**
 * Reads the `/event` SSE stream, calling `onEvent` for each parsed event
 * until it returns `"stop"`, the stream ends, or `signal` aborts.
 */
export async function readOpenCodeEvents(
  baseUrl: string,
  directory: string,
  signal: AbortSignal,
  onEvent: (event: unknown) => "continue" | "stop",
): Promise<void> {
  const response = await fetch(withDirectoryQuery(`${baseUrl}/event`, directory), { signal });
  if (!response.ok || !response.body) {
    throw new Error((await readResponseText(response)) || `OpenCode event stream failed: ${response.status}`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (!signal.aborted) {
    const result = await reader.read();
    if (result.done) break;
    const chunk: unknown = result.value;
    if (!(chunk instanceof Uint8Array)) continue;
    buffer += decoder.decode(chunk, { stream: true });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";
    for (const block of blocks) {
      if (!block.trim()) continue;
      const data = extractSseData(block);
      if (!data.trim()) continue;
      const event = safeJsonParse(data);
      if (event === undefined) continue;
      if (onEvent(event) === "stop") {
        await reader.cancel().catch(() => {});
        return;
      }
    }
  }
}
