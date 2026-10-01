import { describe, expect, it, vi } from "vitest";
import { createRefresher } from "../createRefresher";

describe("createRefresher", () => {
  it("joins an in-flight refresh", async () => {
    let resolve: () => void = () => {};
    const run = vi.fn(() => new Promise<void>((r) => { resolve = r; }));
    const refresher = createRefresher(run, 1000);
    const a = refresher.refresh();
    const b = refresher.refresh();
    const c = refresher.refreshIfStale();
    expect(run).toHaveBeenCalledTimes(1);
    resolve();
    await Promise.all([a, b, c]);
  });

  it("skips stale-checked refreshes inside the window, but not explicit ones", async () => {
    let now = 0;
    const run = vi.fn(() => Promise.resolve());
    const refresher = createRefresher(run, 1000, () => now);
    await refresher.refreshIfStale();
    now = 500;
    await refresher.refreshIfStale();
    expect(run).toHaveBeenCalledTimes(1);
    await refresher.refresh();
    expect(run).toHaveBeenCalledTimes(2);
    now = 2000;
    await refresher.refreshIfStale();
    expect(run).toHaveBeenCalledTimes(3);
  });
});
