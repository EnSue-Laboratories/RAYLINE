/** Window / IPC listeners that feed the app stores (registered once at startup). */

import { convoListStore } from "../../store/convoList";
import { getApi } from "../lib/api";
import { isQueuedMessageReleaseBoundary } from "../conversation/queue";
import { addPermissionRequest, clearPermissionRequestsFor, removePermissionRequest } from "../stores/permissions";
import { getAgentApi } from "../stores/live";
import { getQueue, queueInterruptRequested } from "../stores/queue";
import { patchUi, uiStore } from "../stores/ui";
import type { Unsubscribe } from "@shared/ipc/contract";

/** Permission prompts, queue interrupts and updater status. */
export function startIpcListeners(): () => void {
  const api = getApi();
  if (!api) return () => {};
  const offs: Unsubscribe[] = [];

  if (typeof api.onAgentPermissionRequest === "function") {
    offs.push(api.onAgentPermissionRequest((request) => addPermissionRequest(request)));
    if (typeof api.onAgentPermissionCancelled === "function") {
      offs.push(api.onAgentPermissionCancelled(({ requestId }) => {
        if (requestId) removePermissionRequest(requestId);
      }));
    }
  }

  if (typeof api.onAgentStream === "function" && typeof api.onAgentDone === "function") {
    // A queued message for the active chat interrupts the run at the next
    // tool/turn boundary instead of waiting for the whole turn.
    offs.push(api.onAgentStream(({ conversationId, event }) => {
      if (!conversationId || conversationId !== convoListStore.getState().activeId) return;
      if (queueInterruptRequested.has(conversationId)) return;
      if (!getQueue().some((item) => item.conversationId === conversationId)) return;
      if (!isQueuedMessageReleaseBoundary(event)) return;
      queueInterruptRequested.add(conversationId);
      getAgentApi().cancelMessage(conversationId);
    }));
    offs.push(api.onAgentDone(({ conversationId }) => {
      if (!conversationId) return;
      queueInterruptRequested.delete(conversationId);
      clearPermissionRequestsFor(conversationId);
    }));
  }

  if (typeof api.onUpdaterStatus === "function") {
    offs.push(api.onUpdaterStatus((status) => {
      patchUi({ hasUpdate: status.phase === "available" || status.phase === "ready" });
    }));
  }

  api.getSystemInfo().then(
    (info) => {
      if (info.platform) patchUi({ platform: info.platform });
    },
    () => {},
  );

  return () => {
    for (const off of offs) off();
  };
}

/** `open-multica-setup` window event + closing popovers when the main view changes. */
export function startWindowListeners(): () => void {
  const openMulticaSetup = () => patchUi({ showMulticaSetup: true });
  window.addEventListener("open-multica-setup", openMulticaSetup);

  // PR #230: menus/popovers close when settings, the active chat or the
  // new-chat card change.
  let lastKey = "";
  const closeMenusOnViewChange = () => {
    const { showSettings, showNewChatCard } = uiStore.getState();
    const key = `${showSettings}|${showNewChatCard}|${convoListStore.getState().activeId ?? ""}`;
    if (key === lastKey) return;
    lastKey = key;
    window.dispatchEvent(new Event("rayline:close-menus"));
  };
  const unsubscribers = [uiStore.subscribe(closeMenusOnViewChange), convoListStore.subscribe(closeMenusOnViewChange)];
  closeMenusOnViewChange();

  return () => {
    window.removeEventListener("open-multica-setup", openMulticaSetup);
    for (const unsubscribe of unsubscribers) unsubscribe();
  };
}
