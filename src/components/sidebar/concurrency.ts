/**
 * Maps `items` through an async `worker` with at most `limit` calls in flight.
 * Results keep input order. Aborting `signal` stops scheduling new items and
 * rejects with the signal's reason; the first worker error rejects likewise.
 */
export function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
  signal?: AbortSignal,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  const width = Math.max(1, Math.min(Math.floor(limit) || 1, items.length));
  let next = 0;
  let failed = false;

  return new Promise<R[]>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortReason(signal));
      return;
    }
    if (items.length === 0) {
      resolve(results);
      return;
    }

    let running = 0;
    const fail = (error: Error) => {
      if (failed) return;
      failed = true;
      reject(error);
    };
    const onAbort = () => {
      if (signal) fail(abortReason(signal));
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    const launch = (): void => {
      if (failed) return;
      if (next >= items.length) {
        if (running === 0) {
          signal?.removeEventListener("abort", onAbort);
          resolve(results);
        }
        return;
      }
      const index = next;
      next += 1;
      running += 1;
      // `items[index]` is in range by construction.
      worker(items[index] as T, index).then(
        (value) => {
          results[index] = value;
          running -= 1;
          launch();
        },
        (error: unknown) => {
          running -= 1;
          signal?.removeEventListener("abort", onAbort);
          fail(toError(error));
        },
      );
    };

    for (let i = 0; i < width; i += 1) launch();
  });
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(typeof error === "string" ? error : "Worker failed");
}

function abortReason(signal: AbortSignal): Error {
  const reason: unknown = signal.reason;
  return reason instanceof Error ? reason : new Error("Aborted");
}
