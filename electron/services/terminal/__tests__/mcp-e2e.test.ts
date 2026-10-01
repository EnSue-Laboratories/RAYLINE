// End-to-end: MCP client → terminal MCP server → WS client → WS server →
// real PTY registry. Regression test for issue #219.
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTerminalMcpServer } from "../mcp-server";
import { PtySessionRegistry } from "../pty-sessions";
import { TerminalWsClient } from "../ws-client";
import { TerminalWsServer } from "../ws-server";

function parseToolText(result: unknown): unknown {
  const content = (result as { content?: Array<{ type: string; text?: string }> }).content ?? [];
  const first = content[0];
  return first?.type === "text" && first.text ? (JSON.parse(first.text) as unknown) : undefined;
}

describe.skipIf(process.platform === "win32")("terminal MCP server (e2e)", () => {
  const shellInitRoot = fileURLToPath(new URL("../../../shell-init", import.meta.url));
  const registry = new PtySessionRegistry(() => ({ shellInitRoot, vendorRoot: "/nonexistent" }));
  const wsServer = new TerminalWsServer(registry);
  let wsClient: TerminalWsClient;
  let client: Client;
  const originalShell = process.env.SHELL;

  beforeAll(async () => {
    process.env.SHELL = "/bin/sh";
    const port = await wsServer.start();
    wsClient = new TerminalWsClient(port);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await createTerminalMcpServer(wsClient).connect(serverTransport);
    client = new Client({ name: "test", version: "1.0.0" });
    await client.connect(clientTransport);
  });

  afterAll(async () => {
    await client.close();
    wsClient.close();
    registry.killAll();
    await wsServer.stop();
    process.env.SHELL = originalShell;
  });

  it("lists the five tools", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(["create_session", "send_input", "read_output", "kill_session", "list_sessions"]);
  });

  it("create_session with a command line shows up in list_sessions and runs", async () => {
    const created = await client.callTool({
      name: "create_session",
      arguments: { name: "rayline-landing", command: "printf 'vite-%s\\n' ready", cwd: tmpdir() },
    });
    expect(parseToolText(created)).toEqual({ ok: true, name: "rayline-landing" });

    await vi.waitFor(
      async () => {
        const read = parseToolText(await client.callTool({ name: "read_output", arguments: { name: "rayline-landing" } }));
        expect(JSON.stringify(read)).toContain("vite-ready");
      },
      { timeout: 5000, interval: 100 },
    );

    const listed = parseToolText(await client.callTool({ name: "list_sessions", arguments: {} }));
    expect((listed as Array<{ name: string }>).map((s) => s.name)).toContain("rayline-landing");
  });

  it("reports manager errors as tool errors", async () => {
    const result = await client.callTool({ name: "read_output", arguments: { name: "missing" } });
    expect(result.isError).toBe(true);
    expect(parseToolText(result)).toEqual({ error: "Session 'missing' not found" });
  });
});
