/**
 * Collects a child process's stdout/stderr as text with an optional size cap
 * and timeout — the shared plumbing of every one-shot CLI call in main.
 */

import type { ChildProcess } from "node:child_process";

export interface CollectOptions {
  /** Per-stream character cap; output beyond it is dropped and `truncated` set. */
  limit?: number;
  /** Kill the child after this many ms. */
  timeoutMs?: number;
  /**
   * On timeout, settle immediately with what was collected (default) instead
   * of waiting for the child to exit after being killed.
   */
  settleOnTimeout?: boolean;
}

export interface CollectedOutput {
  stdout: string;
  stderr: string;
  /** Exit code; null when killed by a signal, timed out before exit, or never spawned. */
  code: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  truncated: boolean;
  /** Spawn / runtime error ('error' event). */
  error?: Error;
}

export function collectChildOutput(child: ChildProcess, options: CollectOptions = {}): Promise<CollectedOutput> {
  const { limit = Number.POSITIVE_INFINITY, timeoutMs, settleOnTimeout = true } = options;
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let truncated = false;
    let settled = false;
    let timer: NodeJS.Timeout | null = null;

    const append = (current: string, chunk: string): string => {
      if (current.length >= limit) {
        truncated = true;
        return current;
      }
      const remaining = limit - current.length;
      if (chunk.length > remaining) {
        truncated = true;
        return current + chunk.slice(0, remaining);
      }
      return current + chunk;
    };

    const finish = (code: number | null, signal: NodeJS.Signals | null, error?: Error): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({ stdout, stderr, code, signal, timedOut, truncated, ...(error ? { error } : {}) });
    };

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout = append(stdout, chunk);
    });
    child.stderr?.on("data", (chunk: string) => {
      stderr = append(stderr, chunk);
    });
    child.on("error", (error) => finish(null, null, error));
    child.on("close", (code, signal) => finish(code, signal));

    if (timeoutMs !== undefined) {
      timer = setTimeout(() => {
        timedOut = true;
        try {
          child.kill();
        } catch {
          // already exited
        }
        if (settleOnTimeout) finish(null, null);
      }, timeoutMs);
    }
  });
}
