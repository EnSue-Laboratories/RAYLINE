/** Pure helpers for MulticaSetupModal. */

import type { MulticaListWorkspacesResult, MulticaWorkspace } from "@shared/providers/types";

export type MulticaSetupStep = "connect" | "verify" | "workspace";

/** The server has returned both a bare array and `{ workspaces }`. */
export function normalizeMulticaWorkspaces(result: MulticaListWorkspacesResult | null | undefined): MulticaWorkspace[] {
  if (Array.isArray(result)) return result;
  return result?.workspaces ?? [];
}

/** Message for a rejected IPC call (Error, string, or anything else). */
export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message || String(error);
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") return error.message;
  return String(error);
}

export function multicaSetupTitle(step: MulticaSetupStep): string {
  switch (step) {
    case "connect":
      return "Connect to Multica";
    case "verify":
      return "Verify email";
    case "workspace":
      return "Choose workspace";
    default: {
      const exhaustive: never = step;
      return exhaustive;
    }
  }
}
