/**
 * PTY session registry: spawn / write / read / resize / kill, plus change
 * notifications. Transport-agnostic — IPC (main.ts) and the local WebSocket
 * server both call into this.
 */

import os from "node:os";
import type {
  TerminalCreateOptions,
  TerminalCreateResult,
  TerminalOpResult,
  TerminalReadResult,
  TerminalReveal,
  TerminalSessionInfo,
  TerminalSessionMetadata,
  TerminalSessionsChangeReason,
  TerminalSessionsStatePayload,
} from "@shared/terminal/types";
import { createLogger } from "../../logger";
import { loadNodePty, type IPty } from "./node-pty";
import { createOutputCoalescer, type OutputCallback, type OutputCoalescer } from "./output-coalescer";
import { Scrollback, decodeInputEscapes } from "./scrollback";
import {
  buildCleanEnv,
  defaultShell,
  planCommand,
  resolveShellLaunch,
  withTerminalUxEnv,
  type SupportPaths,
} from "./shell-env";

export const MAX_SESSIONS = 8;
const DEFAULT_READ_LINES = 50;

export type SessionStateCallback = (payload: TerminalSessionsStatePayload) => void;
/** Raw per-chunk listener (the WebSocket broadcast). */
export type OutputListener = (name: string, data: string) => void;
export type ExitListener = (name: string, exitCode: number | null) => void;

export interface OutputCallbackOptions {
  /**
   * Coalesce output per session for this many ms before invoking the
   * callback (e.g. 16 for one IPC message per frame). 0/undefined = per chunk.
   */
  batchMs?: number;
}

interface PtySession {
  name: string;
  pty: IPty;
  command: string;
  cwd: string;
  scrollback: Scrollback;
  exitCode: number | null;
}

const log = createLogger("terminal-manager");

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export class PtySessionRegistry {
  private readonly sessions = new Map<string, PtySession>();
  private output: OutputCallback | OutputCoalescer | null = null;
  private stateCallback: SessionStateCallback | null = null;
  private readonly outputListeners = new Set<OutputListener>();
  private readonly exitListeners = new Set<ExitListener>();

  constructor(private readonly support: () => SupportPaths) {}

  createSession(opts: Partial<TerminalCreateOptions> = {}): TerminalCreateResult {
    const { name, command, cwd } = opts;
    const reveal: TerminalReveal = opts.reveal ?? "auto";
    if (!name) return { error: "name is required" };
    const pty = loadNodePty();
    if (!pty) return { error: "node-pty is not available" };
    if (this.sessions.has(name)) return { error: `Session '${name}' already exists` };
    if (this.sessions.size >= MAX_SESSIONS) return { error: `Maximum session limit (${MAX_SESSIONS}) reached` };

    const plan = planCommand(command, defaultShell());
    const workDir = cwd || os.homedir();
    log(`createSession name=${name} shell=${plan.shell} cwd=${workDir}${plan.kind === "typed" ? ` run=${plan.commandLine}` : ""}`);

    const support = this.support();
    const env = withTerminalUxEnv(buildCleanEnv(process.env), name, support);
    const launch = resolveShellLaunch(plan.shell, env, support.shellInitRoot);

    let ptyProcess: IPty;
    try {
      ptyProcess = pty.spawn(launch.shell, launch.args, {
        name: "xterm-256color",
        cols: 80,
        rows: 24,
        cwd: workDir,
        env: launch.env,
      });
    } catch (err) {
      log("spawn error:", errorMessage(err));
      return { error: `Failed to spawn PTY: ${errorMessage(err)}` };
    }

    const session: PtySession = {
      name,
      pty: ptyProcess,
      command: launch.shell,
      cwd: workDir,
      scrollback: new Scrollback(),
      exitCode: null,
    };

    ptyProcess.onData((data) => {
      session.scrollback.append(data);
      for (const listener of this.outputListeners) listener(name, data);
      if (!this.output) return;
      try {
        this.output(name, data);
      } catch (err) {
        log("outputCallback error:", errorMessage(err));
      }
    });

    ptyProcess.onExit(({ exitCode }) => {
      log(`session '${name}' exited with code ${exitCode}`);
      session.exitCode = exitCode;
      for (const listener of this.exitListeners) listener(name, exitCode);
      // Only the live session owns this name (a new one may have reused it).
      if (this.sessions.get(name) === session) {
        this.sessions.delete(name);
        this.emitState("exited", { name, exitCode });
      }
    });

    this.sessions.set(name, session);
    log(`session '${name}' started (PID ${ptyProcess.pid})`);
    // Typed into the interactive shell; the tty buffers it until the prompt is up.
    if (plan.kind === "typed") ptyProcess.write(`${plan.commandLine}\r`);
    this.emitState("created", { name, reveal });
    return { ok: true, name };
  }

  sendInput(name: string, text: string): TerminalOpResult {
    const session = this.sessions.get(name);
    if (!session) return { error: `Session '${name}' not found` };
    try {
      session.pty.write(decodeInputEscapes(text));
      return { ok: true };
    } catch (err) {
      return { error: errorMessage(err) };
    }
  }

  readOutput(name: string, lines = DEFAULT_READ_LINES): TerminalReadResult {
    const session = this.sessions.get(name);
    if (!session) return { error: `Session '${name}' not found` };
    return { ok: true, lines: session.scrollback.tail(lines) };
  }

  killSession(name: string): TerminalOpResult {
    const session = this.sessions.get(name);
    if (!session) return { error: `Session '${name}' not found` };
    log(`killSession '${name}'`);
    try {
      session.pty.kill();
    } catch (err) {
      log(`kill error for '${name}':`, errorMessage(err));
    }
    if (this.sessions.delete(name)) this.emitState("killed", { name });
    return { ok: true };
  }

  killAll(): void {
    for (const name of [...this.sessions.keys()]) this.killSession(name);
  }

  resizeSession(name: string, cols: number, rows: number): TerminalOpResult {
    const session = this.sessions.get(name);
    if (!session) return { error: `Session '${name}' not found` };
    try {
      session.pty.resize(cols, rows);
      return { ok: true };
    } catch (err) {
      return { error: errorMessage(err) };
    }
  }

  listSessions(): TerminalSessionInfo[] {
    return [...this.sessions.values()].map((s) => ({
      name: s.name,
      command: s.command,
      cwd: s.cwd,
      pid: s.pty.pid,
      exitCode: s.exitCode,
    }));
  }

  getSessionMetadata(): TerminalSessionMetadata[] {
    return [...this.sessions.values()].map((s) => ({ name: s.name, cwd: s.cwd, command: s.command }));
  }

  setOutputCallback(callback: OutputCallback | null, options: OutputCallbackOptions = {}): void {
    if (this.output && "dispose" in this.output) this.output.dispose();
    const batchMs = options.batchMs ?? 0;
    this.output = callback && batchMs > 0 ? createOutputCoalescer(callback, batchMs) : callback;
  }

  setSessionStateCallback(callback: SessionStateCallback | null): void {
    this.stateCallback = callback;
  }

  onOutput(listener: OutputListener): () => void {
    this.outputListeners.add(listener);
    return () => this.outputListeners.delete(listener);
  }

  onExit(listener: ExitListener): () => void {
    this.exitListeners.add(listener);
    return () => this.exitListeners.delete(listener);
  }

  private emitState(
    reason: TerminalSessionsChangeReason,
    details: { name?: string; exitCode?: number | null; reveal?: TerminalReveal },
  ): void {
    // Final output first, so renderers never see "exited" before the last bytes.
    if (details.name && this.output && "flush" in this.output) this.output.flush(details.name);
    if (!this.stateCallback) return;
    try {
      this.stateCallback({ reason, ...details, sessions: this.listSessions() });
    } catch (err) {
      log("sessionStateCallback error:", errorMessage(err));
    }
  }
}
