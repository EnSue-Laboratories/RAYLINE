/**
 * Resolving which provider/native session a conversation continues, loading
 * session files from disk when the ledger doesn't know yet.
 */

import type { Conversation, ConversationSession, CwdRecoveryMarker, LoadedSession, ChatMessage } from "@shared/chat/types";
import type { ModelProviderId } from "@shared/providers/types";
import { getAppSettings } from "../../store/appSettings";
import { updateConvo } from "../../store/convoList";
import { getMainRepoRoot, resolveSafeCwd, type SafeCwdResult } from "../../utils/cwdRecovery";
import {
  getActiveConversationSession,
  getLatestSessionForProvider,
  getPreferredLoadSessionId,
  normalizeConversationState,
  upsertConversationSession,
} from "../conversation/sessions";
import { errorMessage, getApi } from "../lib/api";
import { logSendFlow, logSessionState } from "../log";

export interface LoadedSessionMeta {
  msgs: ChatMessage[];
  sessionCwd: string | null;
  sessionProvider: ModelProviderId | null;
}

export function extractLoadedSessionMeta(result: LoadedSession | ChatMessage[] | null | undefined): LoadedSessionMeta {
  if (Array.isArray(result)) return { msgs: result, sessionCwd: null, sessionProvider: null };
  return {
    msgs: Array.isArray(result?.messages) ? result.messages : [],
    sessionCwd: result?.cwd || null,
    sessionProvider: result?.provider || null,
  };
}

/** Look up the provider of a conversation's stored native session (loads the session file). */
export async function resolveStoredSessionProvider(conversation: Conversation | null | undefined): Promise<ModelProviderId | null> {
  if (!conversation) return null;
  const normalized = normalizeConversationState(conversation);
  if (normalized.sessionProvider) return normalized.sessionProvider;
  const preferredSessionId = getPreferredLoadSessionId(normalized);
  const api = getApi();
  if (!preferredSessionId || !api) return null;

  try {
    const result = await api.loadSession(preferredSessionId);
    const provider = result.provider || null;
    if (provider) {
      logSessionState("resolveStoredSessionProvider", {
        conversationId: normalized.id,
        sessionId: preferredSessionId,
        provider,
        lastProvider: normalized.lastProvider || null,
        providerSessions: normalized.providerSessions,
        activeSessionId: normalized.activeSessionId || null,
      });
      updateConvo(normalized.id, (c) =>
        upsertConversationSession(
          { ...c, sessionProvider: c.sessionProvider || provider },
          {
            provider,
            nativeSessionId: preferredSessionId,
            model: c.model,
            syncedThroughMessageCount: c.archivedMessages.length || c.sessions[0]?.syncedThroughMessageCount || 0,
            origin: "resolved",
          },
          { activate: true, lastProvider: c.lastProvider || provider },
        ),
      );
    }
    return provider;
  } catch {
    return null;
  }
}

export async function resolveConversationLastProvider(conversation: Conversation | null | undefined): Promise<ModelProviderId | null> {
  if (!conversation) return null;
  return (
    conversation.lastProvider ||
    getActiveConversationSession(conversation)?.provider ||
    resolveStoredSessionProvider(conversation)
  );
}

/** A session of `provider` with a native id; null when this conversation has none. */
export async function resolveConversationProviderSession(
  conversation: Conversation | null | undefined,
  provider: ModelProviderId | null | undefined,
): Promise<Pick<ConversationSession, "provider" | "nativeSessionId" | "syncedThroughMessageCount"> & Partial<ConversationSession> | null> {
  if (!conversation || !provider) return null;
  const directSession = getLatestSessionForProvider(conversation, provider, { requireNative: true });
  if (directSession) return directSession;

  const storedProvider = await resolveStoredSessionProvider(conversation);
  const normalized = normalizeConversationState(conversation);
  if (storedProvider === provider && normalized.sessionId) {
    return (
      getLatestSessionForProvider(normalized, provider, { requireNative: true }) ?? {
        provider,
        nativeSessionId: normalized.sessionId,
        syncedThroughMessageCount: normalized.archivedMessages.length,
      }
    );
  }
  return null;
}

// ── cwd recovery ────────────────────────────────────────────────────────────

/** Existence check for `candidateCwd` (+ its repo root and the app cwd); null when not checkable. */
export async function checkCwdRecovery(candidateCwd: string | null | undefined): Promise<SafeCwdResult | null> {
  const api = getApi();
  if (!candidateCwd || !api || typeof api.pathExists !== "function") return null;
  const appCwd = getAppSettings().cwd;
  const candidates = Array.from(
    new Set([candidateCwd, getMainRepoRoot(candidateCwd), appCwd].filter((p): p is string => Boolean(p))),
  );
  try {
    const results = await Promise.all(candidates.map((p) => api.pathExists(p)));
    const existsMap = new Map(candidates.map((p, i) => [p, results[i]]));
    return resolveSafeCwd({ cwd: candidateCwd, appCwd, exists: (p) => existsMap.get(p) === true });
  } catch (err) {
    console.warn("[cwd-recovery] existence check failed:", errorMessage(err));
    return null;
  }
}

export function recoveryMarker(recovery: SafeCwdResult): CwdRecoveryMarker {
  return { originalCwd: recovery.originalCwd, recoveredCwd: recovery.cwd, recoveryReason: recovery.recoveryReason };
}

/**
 * Heal a conversation whose cwd no longer exists: persist the recovered cwd
 * and a `pendingCwdRecovery` marker so the next send tells the model.
 */
export async function healConversationCwdIfMissing(
  conversationId: string,
  conversation: Conversation | null | undefined,
): Promise<SafeCwdResult | null> {
  const convoCwd = conversation?.cwd;
  if (!convoCwd) return null;
  const recovery = await checkCwdRecovery(convoCwd);
  if (!recovery?.wasMissing) return recovery;
  const marker = recoveryMarker(recovery);
  updateConvo(conversationId, (c) => ({
    ...c,
    ...(recovery.cwd ? { cwd: recovery.cwd } : {}),
    pendingCwdRecovery: marker,
  }));
  logSendFlow("cwd-recovery:healed", { conversationId, ...marker });
  return recovery;
}

/** Route a session file's cwd through recovery so we never write back a stale worktree path. */
export async function resolveSessionCwdForWrite(
  sessionCwd: string | null,
): Promise<{ cwd: string | null; marker: CwdRecoveryMarker | null }> {
  if (!sessionCwd) return { cwd: sessionCwd, marker: null };
  const recovery = await checkCwdRecovery(sessionCwd);
  if (!recovery?.wasMissing) return { cwd: sessionCwd, marker: null };
  return { cwd: recovery.cwd || sessionCwd, marker: recoveryMarker(recovery) };
}
