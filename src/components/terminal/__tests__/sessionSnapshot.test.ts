import { describe, expect, it } from "vitest";
import type { TerminalSessionInfo } from "@shared/terminal/types";
import { isSameSessionList, reconcileSessionList, resolveActiveSession } from "../sessionSnapshot";

const session = (name: string, overrides: Partial<TerminalSessionInfo> = {}): TerminalSessionInfo => ({
  name,
  command: "/bin/zsh",
  cwd: "/tmp",
  pid: 100,
  exitCode: null,
  ...overrides,
});

describe("isSameSessionList", () => {
  it("treats structurally equal snapshots as the same", () => {
    expect(isSameSessionList([session("a"), session("b")], [session("a"), session("b")])).toBe(true);
  });

  it("detects added, removed, reordered and changed sessions", () => {
    expect(isSameSessionList([session("a")], [session("a"), session("b")])).toBe(false);
    expect(isSameSessionList([session("a"), session("b")], [session("b"), session("a")])).toBe(false);
    expect(isSameSessionList([session("a")], [session("a", { exitCode: 1 })])).toBe(false);
    expect(isSameSessionList([session("a")], [session("a", { cwd: "/home" })])).toBe(false);
    expect(isSameSessionList([session("a")], [session("a", { pid: 7 })])).toBe(false);
    expect(isSameSessionList([session("a")], [session("a", { command: "bash" })])).toBe(false);
  });
});

describe("reconcileSessionList", () => {
  it("keeps the previous array identity when nothing changed", () => {
    const prev = [session("a")];
    expect(reconcileSessionList(prev, [session("a")])).toBe(prev);
  });

  it("returns the new array when something changed", () => {
    const next = [session("a", { exitCode: 0 })];
    expect(reconcileSessionList([session("a")], next)).toBe(next);
  });
});

describe("resolveActiveSession", () => {
  const sessions = [session("a"), session("b")];

  it("prefers a pending preferred session that exists", () => {
    expect(resolveActiveSession("a", sessions, "b")).toEqual({ active: "b", consumedPreferred: true });
  });

  it("keeps the previous selection when the preferred one is missing", () => {
    expect(resolveActiveSession("a", sessions, "zzz")).toEqual({ active: "a", consumedPreferred: false });
  });

  it("falls back to the first session, or null when empty", () => {
    expect(resolveActiveSession("gone", sessions, null)).toEqual({ active: "a", consumedPreferred: false });
    expect(resolveActiveSession("a", [], null)).toEqual({ active: null, consumedPreferred: false });
  });
});
