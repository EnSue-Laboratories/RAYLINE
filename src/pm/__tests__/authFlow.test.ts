import { describe, expect, it } from "vitest";
import { INITIAL_AUTH_FLOW, authFlowReducer, isFlowActive } from "../auth/authFlow";

describe("authFlowReducer", () => {
  it("walks idle → starting → code → success", () => {
    let state = authFlowReducer(INITIAL_AUTH_FLOW, { type: "start" });
    expect(state).toEqual({ phase: "starting" });
    expect(isFlowActive(state)).toBe(true);
    state = authFlowReducer(state, { type: "gh-event", event: { type: "code", code: "ABCD-1234" } });
    expect(state).toEqual({ phase: "code", code: "ABCD-1234" });
    state = authFlowReducer(state, { type: "gh-event", event: { type: "browser", url: "https://github.com/login/device" } });
    expect(state).toEqual({ phase: "code", code: "ABCD-1234" });
    state = authFlowReducer(state, { type: "gh-event", event: { type: "success", user: "octo" } });
    expect(state).toEqual({ phase: "success", user: "octo" });
    expect(isFlowActive(state)).toBe(false);
  });

  it("cleans gh errors and keeps the raw output", () => {
    const state = authFlowReducer({ phase: "starting" }, {
      type: "gh-event",
      event: { type: "error", error: "Error: token expired", output: "raw log" },
    });
    expect(state).toEqual({ phase: "error", error: "token expired", output: "raw log" });
  });

  it("handles start failures and cancellation", () => {
    expect(authFlowReducer({ phase: "starting" }, { type: "start-failed", error: "boom" }))
      .toEqual({ phase: "error", error: "boom", output: null });
    expect(authFlowReducer({ phase: "code", code: "x" }, { type: "gh-event", event: { type: "cancelled" } }))
      .toEqual({ phase: "cancelled" });
  });
});
