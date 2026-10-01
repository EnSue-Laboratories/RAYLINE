import { useEffect, useReducer, useRef } from "react";
import { useStableCallback } from "../../hooks/useStableCallback";
import { cleanIpcError, errorMessage } from "../format";
import { INITIAL_AUTH_FLOW, authFlowReducer, type AuthFlowState } from "./authFlow";

const SUCCESS_CLOSE_DELAY_MS = 1200;

export interface GhAuthFlow {
  state: AuthFlowState;
  /** Cancels any running gh process and starts a fresh login. */
  retry: () => Promise<void>;
}

/**
 * Drives `gh auth login --web` through window.ghApi: starts on mount, follows
 * `gh-auth-event`s, cancels the gh process if unmounted mid-flow, and calls
 * `onAuthSuccess` shortly after success.
 */
export function useGhAuthFlow(onAuthSuccess: ((user: string | null) => void) | undefined): GhAuthFlow {
  const [state, dispatch] = useReducer(authFlowReducer, INITIAL_AUTH_FLOW);
  const unsubRef = useRef<(() => void) | null>(null);
  const startTimerRef = useRef<number | null>(null);
  const flowStartedRef = useRef(false);

  const clearAuthListener = useStableCallback(() => {
    unsubRef.current?.();
    unsubRef.current = null;
  });

  const clearStartTimer = useStableCallback(() => {
    if (startTimerRef.current !== null) {
      window.clearTimeout(startTimerRef.current);
      startTimerRef.current = null;
    }
  });

  const start = useStableCallback(async () => {
    clearAuthListener();
    flowStartedRef.current = true;
    dispatch({ type: "start" });

    unsubRef.current = window.ghApi.onAuthEvent((event) => {
      if (event.type !== "code" && event.type !== "browser") flowStartedRef.current = false;
      dispatch({ type: "gh-event", event });
    });

    try {
      // `gh auth login --web` handles adding another account while already
      // signed in by asking for re-auth confirmation, which github-manager
      // auto-accepts when needed.
      await window.ghApi.authStart();
    } catch (err) {
      flowStartedRef.current = false;
      dispatch({ type: "start-failed", error: cleanIpcError(errorMessage(err)) });
    }
  });

  useEffect(() => {
    // Defer startup one tick so React StrictMode's mount probe doesn't start
    // and immediately cancel the interactive gh session in development.
    startTimerRef.current = window.setTimeout(() => {
      startTimerRef.current = null;
      void start();
    }, 0);

    return () => {
      clearStartTimer();
      clearAuthListener();
      // Best-effort: if the user closes the modal mid-flow, kill the gh process.
      if (flowStartedRef.current) {
        flowStartedRef.current = false;
        window.ghApi.authCancel().catch(() => {});
      }
    };
  }, [start, clearStartTimer, clearAuthListener]);

  const notifySuccess = useStableCallback((user: string | null) => onAuthSuccess?.(user));
  const successUser = state.phase === "success" ? state.user : undefined;

  useEffect(() => {
    if (successUser === undefined) return;
    const timer = window.setTimeout(() => notifySuccess(successUser), SUCCESS_CLOSE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [successUser, notifySuccess]);

  const retry = useStableCallback(async () => {
    clearStartTimer();
    clearAuthListener();
    if (flowStartedRef.current) {
      flowStartedRef.current = false;
      await window.ghApi.authCancel().catch(() => {});
    }
    await start();
  });

  return { state, retry };
}
