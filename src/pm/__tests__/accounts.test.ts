import { describe, expect, it } from "vitest";
import { markActive, resolveActiveUser, withActiveUser } from "../accounts/accounts";

const accounts = [
  { login: "a", active: true },
  { login: "b", active: false },
];

describe("accounts", () => {
  it("lets the signed-in user decide which account is active", () => {
    expect(withActiveUser(accounts, "b")).toEqual([
      { login: "a", active: false },
      { login: "b", active: true },
    ]);
  });

  it("keeps identity when flags already match or there is no user", () => {
    expect(withActiveUser(accounts, "a")).toBe(accounts);
    expect(withActiveUser(accounts, null)).toBe(accounts);
  });

  it("seeds the list with the current user before accounts load", () => {
    expect(withActiveUser([], "me")).toEqual([{ login: "me", active: true }]);
  });

  it("marks one account active and resolves the active login", () => {
    expect(markActive(accounts, "b").map((a) => a.active)).toEqual([false, true]);
    expect(resolveActiveUser(accounts, null)).toBe("a");
    expect(resolveActiveUser(accounts, "z")).toBe("z");
    expect(resolveActiveUser([], null)).toBeNull();
  });
});
