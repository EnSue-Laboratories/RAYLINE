import { describe, expect, it, vi } from "vitest";
import { applyAppearanceToDocument, applyAppearanceWindowBackground } from "../dom";

function fakeTarget() {
  const props = new Map<string, string>();
  const setProperty = vi.fn((name: string, value: string | null) => {
    props.set(name, value ?? "");
  });
  return {
    props,
    setProperty,
    target: { style: { setProperty, getPropertyValue: (name: string) => props.get(name) ?? "" } },
  };
}

describe("applyAppearanceToDocument", () => {
  it("writes every variable once and skips unchanged ones on re-apply", () => {
    const { props, setProperty, target } = fakeTarget();
    applyAppearanceToDocument(undefined, "dark", target);
    const firstCount = setProperty.mock.calls.length;
    expect(firstCount).toBeGreaterThan(100);
    expect(props.get("--bg-primary")).toBe("#0D0D10");

    applyAppearanceToDocument(undefined, "dark", target);
    expect(setProperty).toHaveBeenCalledTimes(firstCount);

    applyAppearanceToDocument(undefined, "light", target);
    expect(setProperty.mock.calls.length).toBeGreaterThan(firstCount);
    expect(props.get("--bg-primary")).toBe("#F7F4EE");
  });
});

describe("applyAppearanceWindowBackground", () => {
  it("returns the pane color and dedupes the bridge IPC", () => {
    const bridge = { setWindowBackgroundColor: vi.fn() };
    expect(applyAppearanceWindowBackground(undefined, "dark", bridge)).toBe("#0D0D10");
    applyAppearanceWindowBackground(undefined, "dark", bridge);
    expect(bridge.setWindowBackgroundColor).toHaveBeenCalledTimes(1);
    applyAppearanceWindowBackground(undefined, "light", bridge);
    expect(bridge.setWindowBackgroundColor).toHaveBeenLastCalledWith("#F7F4EE");
  });
});
