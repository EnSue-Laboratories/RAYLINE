/**
 * Frame-coalesced event buffer: buffered items are applied at most once per
 * `minIntervalMs` (default 32 ms ≈ 30 fps) on an animation frame, in arrival
 * order. Immediate items flush synchronously together with everything queued
 * before them.
 */

export interface FrameScheduler {
  now(): number;
  requestFrame(callback: () => void): number;
  cancelFrame(handle: number): void;
}

export const STREAM_FLUSH_MIN_INTERVAL_MS = 32;

export const browserFrameScheduler: FrameScheduler = {
  now: () => performance.now(),
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (handle) => cancelAnimationFrame(handle),
};

export interface StreamBuffer<T> {
  push(item: T, immediate: boolean): void;
  /** Apply everything buffered now (urgent), cancelling a scheduled frame. */
  flush(): void;
  /** Cancel the scheduled frame and drop buffered items (no flush). */
  dispose(): void;
  readonly size: number;
}

export function createStreamBuffer<T>(
  apply: (items: T[], urgent: boolean) => void,
  scheduler: FrameScheduler = browserFrameScheduler,
  minIntervalMs: number = STREAM_FLUSH_MIN_INTERVAL_MS,
): StreamBuffer<T> {
  let pending: T[] = [];
  let frame = 0;
  let lastFlushAt = Number.NEGATIVE_INFINITY;

  const cancelFrame = (): void => {
    if (!frame) return;
    scheduler.cancelFrame(frame);
    frame = 0;
  };

  const flushNow = (urgent: boolean): void => {
    if (pending.length === 0) return;
    const items = pending;
    pending = [];
    lastFlushAt = scheduler.now();
    apply(items, urgent);
  };

  const tick = (): void => {
    if (scheduler.now() - lastFlushAt < minIntervalMs) {
      frame = scheduler.requestFrame(tick);
      return;
    }
    frame = 0;
    flushNow(false);
  };

  return {
    push(item, immediate) {
      pending.push(item);
      if (immediate) {
        cancelFrame();
        flushNow(true);
      } else if (!frame) {
        frame = scheduler.requestFrame(tick);
      }
    },
    flush() {
      cancelFrame();
      flushNow(true);
    },
    dispose() {
      cancelFrame();
      pending = [];
    },
    get size() {
      return pending.length;
    },
  };
}
