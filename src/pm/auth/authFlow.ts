import type { GhAuthEvent } from "@shared/github/types";
import { cleanIpcError } from "../format";

/** `gh auth login --web` device-flow progress shown by AuthModal. */
export type AuthFlowState =
  | { phase: "idle" }
  | { phase: "starting" }
  | { phase: "code"; code: string }
  | { phase: "success"; user: string | null }
  | { phase: "error"; error: string; output: string | null }
  | { phase: "cancelled" };

export type AuthFlowAction =
  | { type: "start" }
  | { type: "start-failed"; error: string }
  | { type: "gh-event"; event: GhAuthEvent };

export const INITIAL_AUTH_FLOW: AuthFlowState = { phase: "idle" };

/** Whether the gh process is (still) running for this state. */
export function isFlowActive(state: AuthFlowState): boolean {
  return state.phase === "starting" || state.phase === "code";
}

export function authFlowReducer(state: AuthFlowState, action: AuthFlowAction): AuthFlowState {
  switch (action.type) {
    case "start":
      return { phase: "starting" };
    case "start-failed":
      return { phase: "error", error: action.error, output: null };
    case "gh-event":
      return applyGhAuthEvent(state, action.event);
    default: {
      const unreachable: never = action;
      return unreachable;
    }
  }
}

function applyGhAuthEvent(state: AuthFlowState, event: GhAuthEvent): AuthFlowState {
  switch (event.type) {
    case "code":
      return { phase: "code", code: event.code };
    case "success":
      return { phase: "success", user: event.user || null };
    case "error":
      return { phase: "error", error: cleanIpcError(event.error), output: event.output || null };
    case "cancelled":
      return { phase: "cancelled" };
    case "browser":
      // The browser opening doesn't change what the modal shows.
      return state;
    default: {
      const unreachable: never = event;
      return unreachable;
    }
  }
}
