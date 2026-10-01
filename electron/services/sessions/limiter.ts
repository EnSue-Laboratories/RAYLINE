/** Minimal promise concurrency limiter (no dependency). */

export type Limiter = <T>(task: () => Promise<T>) => Promise<T>;

export function createLimiter(concurrency: number): Limiter {
  const max = Math.max(1, Math.floor(concurrency));
  let active = 0;
  const queue: Array<() => void> = [];

  const next = (): void => {
    if (active >= max) return;
    const start = queue.shift();
    if (start) start();
  };

  return <T>(task: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      queue.push(() => {
        active += 1;
        task()
          .then(resolve, reject)
          .finally(() => {
            active -= 1;
            next();
          });
      });
      next();
    });
}

/** `Promise.all(items.map(fn))` with at most `concurrency` in flight. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const limit = createLimiter(concurrency);
  return Promise.all(items.map((item, index) => limit(() => fn(item, index))));
}
