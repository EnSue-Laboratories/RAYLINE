/** Opening conversations: select, lazy transcript load, session-file sync, preview hydration. */

import type { Conversation } from "@shared/chat/types";
import { findConvo, getActiveId, getConvos, setActiveId, updateConvo } from "../../store/convoList";
import { ensureTranscriptLoaded } from "../../store/persistence";
import { markSeenPatch, withTabPatch } from "../../utils/tabs";
import { getLastMessagePreview, mergeArchivedMessages, serializeMessagesForState } from "../conversation/archive";
import { getPreferredLoadSessionId, normalizeConversationState, upsertConversationSession } from "../conversation/sessions";
import { getApi } from "../lib/api";
import { logSessionState } from "../log";
import { getAgentApi, getLiveConversation } from "../stores/live";
import { isTranscriptPending } from "../stores/transcripts";
import { patchUi } from "../stores/ui";
import {
  extractLoadedSessionMeta,
  healConversationCwdIfMissing,
  resolveSessionCwdForWrite,
  type LoadedSessionMeta,
} from "./sessionResolution";

type SessionApplyMode = "select" | "preview";

/**
 * Merge a loaded CLI session (messages, provider, cwd) into the conversation
 * row. "select" activates the session and trusts its cwd; "preview" (startup
 * hydration) only fills gaps.
 */
async function applyLoadedSession(
  id: string,
  sessionIdToLoad: string,
  { msgs, sessionCwd, sessionProvider }: LoadedSessionMeta,
  mode: SessionApplyMode,
): Promise<void> {
  // Route sessionCwd through recovery so we don't overwrite a healed
  // conversation.cwd with the stale worktree path stored in the session file.
  const { cwd: safeSessionCwd, marker } = await resolveSessionCwdForWrite(sessionCwd);
  if (msgs.length === 0 && !sessionProvider && !sessionCwd) return;

  const serializedSessionMessages = msgs.length > 0 ? serializeMessagesForState(msgs) : null;
  const previewText = msgs.length > 0 ? getLastMessagePreview(msgs) : "";
  const origin =
    mode === "select" ? (msgs.length > 0 ? "loaded" : "loaded-meta") : msgs.length > 0 ? "preview-load" : "preview-meta";

  updateConvo(id, (c) => {
    const next = sessionProvider
      ? upsertConversationSession(
          { ...c, ...(sessionIdToLoad === c.sessionId ? { sessionProvider } : {}) },
          {
            provider: sessionProvider,
            nativeSessionId: sessionIdToLoad,
            model: c.model,
            syncedThroughMessageCount: msgs.length > 0 ? msgs.length : c.archivedMessages.length,
            origin,
          },
          { activate: mode === "select" || !c.activeSessionId, lastProvider: c.lastProvider || sessionProvider },
        )
      : normalizeConversationState(c);

    const fillCwd = mode === "select" || !c.cwd;
    // An unloaded (v2) transcript is still on disk; merging into the empty
    // placeholder would overwrite it, so leave archives alone until opened.
    const mergeArchive = serializedSessionMessages && !isTranscriptPending(id);
    return normalizeConversationState({
      ...next,
      ...(previewText ? { lastPreview: previewText } : {}),
      ...(fillCwd && safeSessionCwd ? { cwd: safeSessionCwd } : {}),
      ...(fillCwd && marker ? { pendingCwdRecovery: marker } : {}),
      ...(mergeArchive ? { archivedMessages: mergeArchivedMessages(c.archivedMessages, serializedSessionMessages) } : {}),
    });
  });
}

/** Open a conversation: show it, load its transcript, then sync with its CLI session file. */
export async function selectConversation(id: string): Promise<void> {
  patchUi({ showSettings: false, showNewChatCard: false, newChatProject: undefined });
  setActiveId(id);
  updateConvo(id, (c) => withTabPatch(c, markSeenPatch()));
  const convo = findConvo(id);
  const api = getApi();
  if (!convo || !api) return;

  // Fire-and-forget: if this chat's worktree was promoted/deleted, point it
  // at the project root; the next send tells the model out-of-band.
  void healConversationCwdIfMissing(id, convo);

  await ensureTranscriptLoaded(id);
  const loaded = findConvo(id);
  if (!loaded) return;
  const agent = getAgentApi();
  if (getLiveConversation(id).messages.length === 0 && loaded.archivedMessages.length > 0) {
    agent.loadMessages(id, loaded.archivedMessages);
  }

  try {
    const sessionIdToLoad = getPreferredLoadSessionId(loaded);
    if (!sessionIdToLoad) return;
    const meta = extractLoadedSessionMeta(await api.loadSession(sessionIdToLoad));
    logSessionState("handleSelect:loaded", {
      conversationId: id,
      sessionIdToLoad,
      sessionProvider: meta.sessionProvider,
      lastProvider: loaded.lastProvider || null,
      providerSessions: loaded.providerSessions,
    });
    if (meta.msgs.length > 0 && getLiveConversation(id).messages.length === 0) {
      agent.loadMessages(id, meta.msgs);
    }
    await applyLoadedSession(id, sessionIdToLoad, meta, "select");
  } catch (e) {
    console.error("Failed to load session:", e);
  }
}

const PREVIEW_CONCURRENCY = 4;

function needsPreviewHydration(c: Conversation): boolean {
  return !c.lastPreview || c.lastPreview === "Empty" || !c.cwd || !c.lastProvider;
}

/** Most relevant first: the active conversation, then most recent. */
export function orderForPreviewHydration(convos: readonly Conversation[], activeId: string | null): Conversation[] {
  return convos
    .filter(needsPreviewHydration)
    .sort((a, b) => {
      if (a.id === activeId) return -1;
      if (b.id === activeId) return 1;
      return (b.ts || 0) - (a.ts || 0);
    });
}

/**
 * Startup: fill missing previews / provider / cwd from CLI session files,
 * at most 4 `load-session` calls in flight (each one blocks main on I/O).
 */
export async function hydrateConversationPreviews(): Promise<void> {
  const api = getApi();
  if (!api) return;
  const queue = orderForPreviewHydration(getConvos(), getActiveId());

  const worker = async () => {
    for (let c = queue.shift(); c; c = queue.shift()) {
      try {
        const sessionIdToLoad = getPreferredLoadSessionId(c);
        if (!sessionIdToLoad) continue;
        const meta = extractLoadedSessionMeta(await api.loadSession(sessionIdToLoad));
        if (!findConvo(c.id)) continue;
        await applyLoadedSession(c.id, sessionIdToLoad, meta, "preview");
      } catch {
        // Ignore hydrate-time session/cwd failures and keep going.
      }
    }
  };
  await Promise.all(Array.from({ length: PREVIEW_CONCURRENCY }, worker));
}
