/**
 * Terminal bridge details agent providers hand to the CLIs they spawn (the
 * MCP config for the terminal-sessions server and the terminal WebSocket
 * port). electron/app/terminal-bridge publishes them once the server is up;
 * until then they are unknown and providers run without terminal access.
 */

export interface TerminalBridgeInfo {
  mcpConfigPath: string;
  wsPort: number;
}

let current: TerminalBridgeInfo | null = null;

export function setTerminalBridgeInfo(info: TerminalBridgeInfo | null): void {
  current = info;
}

export function getTerminalBridgeInfo(): TerminalBridgeInfo | null {
  return current;
}
