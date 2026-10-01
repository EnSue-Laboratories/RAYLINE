/**
 * Coalesces refreshes of a shared resource (IPC status probe, network list)
 * that many mounted hook instances used to trigger independently.
 *
 * - `refresh()` always runs, but joins a refresh that is already in flight.
 * - `refreshIfStale()` (for mount effects) also skips when the last refresh
 *   finished less than `staleMs` ago.
 */
export interface Refresher {
  refresh(): Promise<void>;
  refreshIfStale(): Promise<void>;
}

export function createRefresher(run: () => Promise<void>, staleMs: number, now: () => number = Date.now): Refresher {
  let inFlight: Promise<void> | null = null;
  let lastFinishedAt = Number.NEGATIVE_INFINITY;

  const refresh = (): Promise<void> => {
    inFlight ??= run().finally(() => {
      inFlight = null;
      lastFinishedAt = now();
    });
    return inFlight;
  };

  const refreshIfStale = (): Promise<void> => {
    if (inFlight) return inFlight;
    if (now() - lastFinishedAt < staleMs) return Promise.resolve();
    return refresh();
  };

  return { refresh, refreshIfStale };
}
