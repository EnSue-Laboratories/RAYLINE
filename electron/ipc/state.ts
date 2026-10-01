/**
 * App state persistence: v2 split channels (`state:*`), the legacy
 * whole-state channels kept for the transition, and the Project Manager's
 * repo list. All disk work lives in services/state-store.
 */

import { BrowserWindow } from "electron";
import type { AppContext } from "../app/context";
import { isStringArray } from "../services/state-transform";
import { handle, onSync } from "./typed";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function registerStateIpc(ctx: AppContext): void {
  const store = ctx.stateStore;

  // v2
  handle("state:load", () => store.loadIndex());
  handle("state:load-conversation", (_event, conversationId) => store.loadConversation(conversationId));
  handle("state:save", (_event, request) => store.save(request));
  onSync("state:save-sync", (_event, request) => store.saveSync(request));

  // Legacy whole-state channels.
  handle("save-state", (_event, state) => store.saveLegacy(state));
  onSync("save-state-sync", (_event, state) => store.saveLegacySync(state));
  handle("load-state", (event) => {
    // The Project Manager only reads preferences (locale / appearance) on
    // every focus, so it gets the cheap settings-only view.
    const fromPm = ctx.windows.pm !== null && BrowserWindow.fromWebContents(event.sender) === ctx.windows.pm;
    return store.loadLegacy(fromPm ? "settings" : "full");
  });

  // Project Manager repo list (owned by the PM window, preserved across main-window saves).
  handle("gh-load-pm-state", () => store.loadPmState());
  handle("gh-save-pm-state", (_event, pmState) => {
    const repos = isRecord(pmState) && isStringArray(pmState.repos) ? pmState.repos : [];
    return store.savePmRepos(repos);
  });
}
