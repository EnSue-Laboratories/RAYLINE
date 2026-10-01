#!/usr/bin/env node
/**
 * MCP server ("terminal-sessions") bridging Claude / Codex tool calls to the
 * RayLine terminal manager's local WebSocket API.
 *
 *   node mcp-terminal-server.cjs <ws-port>
 *
 * Bundled standalone by scripts/build-electron and run by a plain Node
 * runtime from app.asar.unpacked — it must never import Electron.
 * Implementation: electron/services/terminal/mcp-server.ts.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createTerminalMcpServer } from "./services/terminal/mcp-server";
import { TerminalWsClient } from "./services/terminal/ws-client";

async function main(): Promise<void> {
  const port = Number(process.argv[2]);
  if (!process.argv[2] || !Number.isInteger(port) || port <= 0) {
    process.stderr.write("Usage: mcp-terminal-server.cjs <ws-port>\n");
    process.exit(1);
  }
  const client = new TerminalWsClient(port);
  // Connect eagerly; a failed connect is retried on the first tool call.
  client.connect().catch(() => undefined);
  await createTerminalMcpServer(client).connect(new StdioServerTransport());
}

main().catch((err: unknown) => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
