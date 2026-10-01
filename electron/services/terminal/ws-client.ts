/**
 * Client for the terminal manager's local WebSocket API. Used by the
 * standalone MCP terminal server and the `claudi-terminal` CLI, so it must
 * never import Electron.
 */

import WebSocket from "ws";
import type { TerminalWsAction, TerminalWsRequest } from "@shared/terminal/types";

export interface TerminalWsClientOptions {
  /** Per-request timeout. Default 10 s. */
  requestTimeoutMs?: number;
  /** How long a request waits for the socket to open. Default 5 s. */
  connectTimeoutMs?: number;
  /** Factory override (tests). */
  createSocket?: (url: string) => WebSocket;
}

interface Pending {
  resolve: (result: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

function responseOf(data: WebSocket.RawData): { id: unknown; result: unknown; error: unknown } | null {
  try {
    const text = Buffer.isBuffer(data)
      ? data.toString()
      : Array.isArray(data)
        ? Buffer.concat(data).toString()
        : Buffer.from(data).toString();
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null) return null;
    const msg = parsed as Record<string, unknown>;
    return { id: msg.id, result: msg.result, error: msg.error };
  } catch {
    return null;
  }
}

/**
 * Persistent, self-healing connection: requests wait for the socket to open
 * (instead of failing while it connects) and a dropped socket is reopened on
 * the next request.
 */
export class TerminalWsClient {
  private socket: WebSocket | null = null;
  private opening: Promise<WebSocket> | null = null;
  private readonly pending = new Map<number, Pending>();
  private nextId = 1;
  private readonly requestTimeoutMs: number;
  private readonly connectTimeoutMs: number;
  private readonly createSocket: (url: string) => WebSocket;

  constructor(
    private readonly port: number,
    options: TerminalWsClientOptions = {},
  ) {
    this.requestTimeoutMs = options.requestTimeoutMs ?? 10_000;
    this.connectTimeoutMs = options.connectTimeoutMs ?? 5_000;
    this.createSocket = options.createSocket ?? ((url) => new WebSocket(url));
  }

  /** Open the connection early (optional — `call` connects on demand). */
  connect(): Promise<WebSocket> {
    if (this.socket?.readyState === WebSocket.OPEN) return Promise.resolve(this.socket);
    this.opening ??= this.open().finally(() => {
      this.opening = null;
    });
    return this.opening;
  }

  async call(action: TerminalWsAction, params: Record<string, unknown> = {}): Promise<unknown> {
    const socket = await this.connect();
    const id = this.nextId++;
    const request: TerminalWsRequest = { id, action, params };
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request ${action} timed out after ${Math.round(this.requestTimeoutMs / 1000)}s`));
      }, this.requestTimeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify(request), (err) => {
        if (err) this.settle(id, err);
      });
    });
  }

  close(): void {
    this.failAll(new Error("Connection closed"));
    const socket = this.socket;
    this.socket = null;
    socket?.removeAllListeners();
    socket?.on("error", () => undefined);
    socket?.close();
  }

  private open(): Promise<WebSocket> {
    return new Promise<WebSocket>((resolve, reject) => {
      const socket = this.createSocket(`ws://127.0.0.1:${this.port}`);
      const timer = setTimeout(() => {
        socket.terminate();
        reject(new Error(`Could not connect to the terminal manager on port ${this.port}`));
      }, this.connectTimeoutMs);

      socket.once("open", () => {
        clearTimeout(timer);
        this.socket = socket;
        resolve(socket);
      });
      socket.on("message", (data) => {
        const msg = responseOf(data);
        if (!msg || typeof msg.id !== "number") return; // broadcasts / foreign ids
        this.settle(msg.id, null, msg.error === undefined ? msg.result : { error: msg.error });
      });
      socket.on("error", (err) => {
        clearTimeout(timer);
        this.failAll(new Error(`WebSocket error: ${err.message}`));
        reject(new Error(`WebSocket error: ${err.message}`));
      });
      socket.on("close", () => {
        clearTimeout(timer);
        if (this.socket === socket) this.socket = null;
        this.failAll(new Error("Connection to the terminal manager closed"));
        reject(new Error("Connection to the terminal manager closed"));
      });
    });
  }

  private settle(id: number, err: Error | null, result?: unknown): void {
    const pending = this.pending.get(id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(id);
    if (err) pending.reject(err);
    else pending.resolve(result);
  }

  private failAll(err: Error): void {
    for (const id of [...this.pending.keys()]) this.settle(id, err);
  }
}
