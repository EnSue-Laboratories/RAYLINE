/**
 * WebSocket server on 127.0.0.1 (random port) exposing the PTY sessions to
 * the MCP terminal server and the `claudi-terminal` CLI.
 */

import type { AddressInfo } from "node:net";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import type { TerminalWsBroadcast } from "@shared/terminal/types";
import { createLogger } from "./deps";
import { handleTerminalWsMessage, type TerminalSessionApi } from "./ws-protocol";

const log = createLogger("terminal-manager");

function rawToString(raw: RawData): string {
  if (Array.isArray(raw)) return Buffer.concat(raw).toString();
  if (raw instanceof ArrayBuffer) return Buffer.from(raw).toString();
  return raw.toString();
}

export class TerminalWsServer {
  private wss: WebSocketServer | null = null;
  private port: number | null = null;

  constructor(private readonly api: TerminalSessionApi) {}

  getPort(): number | null {
    return this.port;
  }

  start(): Promise<number> {
    return new Promise((resolve, reject) => {
      if (this.wss && this.port !== null) {
        log("server already running on port", this.port);
        resolve(this.port);
        return;
      }

      const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });

      server.on("error", (err) => {
        log("WebSocket server error:", err.message);
        // Error before we could bind — reject the startup promise.
        if (this.port === null) reject(err);
      });

      server.on("listening", () => {
        const port = (server.address() as AddressInfo).port;
        this.port = port;
        this.wss = server;
        log(`WebSocket server listening on 127.0.0.1:${port}`);
        resolve(port);
      });

      server.on("connection", (ws, req) => {
        const remote = req.socket.remoteAddress;
        log("client connected from", remote);
        ws.on("message", (raw) => {
          ws.send(JSON.stringify(handleTerminalWsMessage(this.api, rawToString(raw))));
        });
        ws.on("error", (err) => log("client socket error:", err.message));
        ws.on("close", () => log("client disconnected from", remote));
      });
    });
  }

  /** Push an event to every connected client (skips serialization when none). */
  broadcast(payload: TerminalWsBroadcast): void {
    const wss = this.wss;
    if (!wss || wss.clients.size === 0) return;
    const msg = JSON.stringify(payload);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(msg);
    }
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      const wss = this.wss;
      if (!wss) {
        resolve();
        return;
      }
      wss.close(() => {
        log("WebSocket server closed");
        this.wss = null;
        this.port = null;
        resolve();
      });
      // Force-close open client connections so the server can drain promptly.
      for (const client of wss.clients) {
        try {
          client.terminate();
        } catch {
          /* already gone */
        }
      }
    });
  }
}
