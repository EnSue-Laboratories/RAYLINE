/**
 * Batches PTY output per session so consumers (IPC to renderers) see at most
 * one message per session per frame instead of one per node-pty chunk.
 *
 *   const coalesce = createOutputCoalescer((name, data) => send(name, data), 16);
 *   terminalManager.setOutputCallback(coalesce);   // or { batchMs: 16 }
 *
 * Output for a session is flushed before that session's exit/kill state is
 * emitted, so the renderer never sees "exited" ahead of the final bytes.
 */

export type OutputCallback = (name: string, data: string) => void;

export interface OutputCoalescer extends OutputCallback {
  /** Deliver pending output now (all sessions, or just `name`). */
  flush(name?: string): void;
  /** Drop the timer; pending output is flushed first. */
  dispose(): void;
}

export function createOutputCoalescer(deliver: OutputCallback, intervalMs = 16): OutputCoalescer {
  const pending = new Map<string, string[]>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const deliverOne = (name: string): void => {
    const chunks = pending.get(name);
    if (!chunks) return;
    pending.delete(name);
    deliver(name, chunks.length === 1 ? (chunks[0] ?? "") : chunks.join(""));
  };

  const flush = (name?: string): void => {
    if (name !== undefined) {
      deliverOne(name);
    } else {
      for (const key of [...pending.keys()]) deliverOne(key);
    }
    if (pending.size === 0 && timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const push = (name: string, data: string): void => {
    const chunks = pending.get(name);
    if (chunks) chunks.push(data);
    else pending.set(name, [data]);
    timer ??= setTimeout(() => {
      timer = null;
      flush();
    }, intervalMs);
  };

  return Object.assign(push, {
    flush,
    dispose: () => flush(),
  });
}
