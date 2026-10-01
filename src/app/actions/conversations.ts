/** Conversation-level actions wired to the sidebar, tab strip and chat header. */

import type { EffortLevel } from "@shared/models/types";
import { setAppSetting } from "../../store/appSettings";
import { getActiveConvo, getActiveId, getConvos, setActiveId, setConvos, updateConvo } from "../../store/convoList";
import { clearDraft } from "../../utils/composerDrafts";
import { clearPinnedTabs, countPinnedTabs, resetPinnedTabs, unpinTabPatch, withTabPatch } from "../../utils/tabs";
import { getLatestSessionForProvider, normalizeConversationState } from "../conversation/sessions";
import { getPinnedTabs } from "../derived/store";
import { neighbourTabId } from "../derived/tabs";
import { dismissTabRound } from "../effects/streamingTabs";
import { getApi } from "../lib/api";
import { logSessionState } from "../log";
import { cancelMessage, getConversation } from "../../store/conversations";
import { resolveModel } from "../stores/models";
import { getUi, patchUi } from "../stores/ui";
import { selectConversation } from "./navigation";

/** Sidebar delete. */
export function deleteConversation(id: string, event?: { stopPropagation: () => void }): void {
  event?.stopPropagation();
  cancelMessage(id);
  const pinnedTabs = getPinnedTabs();
  const remaining = getConvos().filter((c) => c.id !== id);
  const next = resetPinnedTabs(remaining);
  if (next !== remaining) dismissTabRound();
  setConvos(() => next);
  clearDraft(`conversation:${id}`);
  if (getActiveId() !== id) return;
  // Prefer an adjacent pinned tab so deleting from the tab strip stays in tab
  // context; otherwise fall back to the most recent conversation. Route
  // through select so the history actually loads.
  const nextActiveId = neighbourTabId(pinnedTabs, id) || next[0]?.id || null;
  if (nextActiveId) void selectConversation(nextActiveId);
  else setActiveId(null);
}

/** Tab strip close: unpin (dismissing the strip below two tabs) and move to a neighbour. */
export function closeTab(id: string): void {
  const nextActiveId = getActiveId() === id ? neighbourTabId(getPinnedTabs(), id) : null;
  setConvos((prev) => {
    const next = prev.map((c) => (c.id === id ? withTabPatch(c, unpinTabPatch()) : c));
    if (countPinnedTabs(next) >= 2) return next;
    dismissTabRound();
    return clearPinnedTabs(next);
  });
  if (nextActiveId) void selectConversation(nextActiveId);
}

export function cancelActiveRun(): void {
  const active = getActiveId();
  if (active) cancelMessage(active);
}

/** Model picker: set the active conversation's model and the default model. */
export function changeModel(modelId: string): void {
  const active = getActiveId();
  const activeConvo = getActiveConvo();
  const nextProvider = resolveModel(modelId).provider;
  const normalized = activeConvo ? normalizeConversationState(activeConvo) : null;
  const currentProvider = normalized ? resolveModel(normalized.model).provider : "claude";
  logSessionState("handleModelChange", {
    conversationId: active,
    modelId,
    currentProvider,
    nextProvider,
    lastProvider: normalized?.lastProvider || null,
    sessionId: normalized?.sessionId || null,
    sessionProvider: normalized?.sessionProvider || null,
    providerSessions: normalized?.providerSessions || null,
    activeSessionId: normalized?.activeSessionId || null,
  });
  if (active && getConversation(active).isStreaming && currentProvider === "multica" && modelId !== normalized?.model) {
    cancelMessage(active);
  }
  if (active) updateConvo(active, (c) => (c.model === modelId ? c : { ...c, model: modelId }));
  setAppSetting("defaultModel", modelId);
}

/**
 * Effort picker: per-conversation effort (null = model default). With no
 * active conversation it applies to the next chat created.
 */
export function changeEffort(effort: EffortLevel | null): void {
  const active = getActiveId();
  // The new-chat card picks the effort for the chat it is about to create.
  if (!active || getUi().showNewChatCard) {
    patchUi({ newChatEffort: effort });
    return;
  }
  updateConvo(active, (c) => ((c.effort ?? null) === effort ? c : { ...c, effort }));
}

/** Chat header folder picker: change the app cwd and move the active Claude session there. */
export async function pickFolder(): Promise<void> {
  const api = getApi();
  if (!api) return;
  const folder = await api.pickFolder();
  if (!folder) return;
  setAppSetting("cwd", folder);
  const activeConvo = getActiveConvo();
  if (!activeConvo || activeConvo.cwd === folder) return;
  try {
    const claudeSessionId =
      getLatestSessionForProvider(normalizeConversationState(activeConvo), "claude", { requireNative: true })?.nativeSessionId || null;
    if (claudeSessionId) await api.moveSession(claudeSessionId, folder);
    updateConvo(activeConvo.id, (c) => ({ ...c, cwd: folder }));
  } catch (e) {
    console.error("Failed to move session:", e);
  }
}

/** Branch/worktree switcher: the active conversation follows the new cwd. */
export function changeCwd(newCwd: string): void {
  setAppSetting("cwd", newCwd);
  const active = getActiveId();
  if (active) updateConvo(active, (c) => (c.cwd === newCwd ? c : { ...c, cwd: newCwd }));
}
