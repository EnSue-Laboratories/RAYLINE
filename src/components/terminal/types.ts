import type { TerminalCreateOptions, TerminalCreateResult, TerminalSessionInfo } from "@shared/terminal/types";

/**
 * What a mounted xterm session exposes to `useTerminal`. Replaces the old
 * practice of registering the raw xterm `Terminal` and monkey-patching a
 * `__raylineFit` method onto it.
 */
export interface TerminalHandle {
  /** PTY output for this session. Buffered while the session is hidden. */
  write(data: string): void;
  focus(): void;
  /** Re-measure the container and resize the PTY if the grid changed. */
  fit(): void;
}

export type CreateTerminalSession = (options: TerminalCreateOptions) => Promise<TerminalCreateResult>;
export type SendTerminalInput = (name: string, text: string) => void;
export type ResizeTerminalSession = (name: string, cols: number, rows: number) => void;
export type RegisterTerminal = (name: string, handle: TerminalHandle) => void;
export type UnregisterTerminal = (name: string, handle?: TerminalHandle) => void;

export type { TerminalSessionInfo };
