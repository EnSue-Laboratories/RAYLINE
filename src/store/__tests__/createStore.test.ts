import { describe, expect, it, vi } from "vitest";
import { createStore, shallowEqual } from "../createStore";

describe("createStore", () => {
  it("notifies subscribers only when state identity changes", () => {
    const store = createStore({ count: 0 });
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.setState((prev) => prev);
    expect(listener).not.toHaveBeenCalled();

    store.setState((prev) => ({ count: prev.count + 1 }));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getState().count).toBe(1);

    unsubscribe();
    store.setState({ count: 5 });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("shallowEqual", () => {
  it("compares arrays and objects one level deep", () => {
    const shared = { id: 1 };
    expect(shallowEqual([shared, 2], [shared, 2])).toBe(true);
    expect(shallowEqual([{ id: 1 }], [{ id: 1 }])).toBe(false);
    expect(shallowEqual({ a: 1, b: shared }, { b: shared, a: 1 })).toBe(true);
    expect(shallowEqual({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(shallowEqual([1], { 0: 1 })).toBe(false);
  });
});
