/**
 * Conversation session ledger: one entry per provider-native session
 * (Claude session uuid, Codex thread, OpenCode session…). Pure functions;
 * `normalizeConversationState` is the single place that derives
 * `providerSessions` / `sessionId` / `sessionProvider` / `activeSessionId`.
 */

import type {
  ChatMessage,
  Conversation,
  ConversationData,
  ConversationSession,
  ConversationSessionOrigin,
} from "@shared/chat/types";
import { getRuntimeProviderForProvider, type ModelProviderId } from "@shared/providers/types";
import {
  isNonEmptyArchivedMessage,
  sanitizeArchivedMessage,
  stripTransientMessageState,
} from "./archive";

/** Partial session as produced by callers; normalized by `createConversationSession`. */
export interface SessionInput {
  id?: string;
  provider?: ModelProviderId | null;
  nativeSessionId?: string | null;
  model?: string | null;
  syncedThroughMessageCount?: number;
  createdAt?: number;
  updatedAt?: number;
  origin?: ConversationSessionOrigin;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function makeSessionLedgerId(provider: string = "unknown"): string {
  return `session-${provider}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function sortConversationSessions(sessions: readonly ConversationSession[] | null | undefined): ConversationSession[] {
  return [...(sessions ?? [])].sort((a, b) => {
    const updatedDiff = (b.updatedAt || 0) - (a.updatedAt || 0);
    if (updatedDiff !== 0) return updatedDiff;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });
}

export function createConversationSession(input: SessionInput = {}): ConversationSession {
  const now = Date.now();
  const created = isFiniteNumber(input.createdAt) ? input.createdAt : now;
  return {
    id: input.id || makeSessionLedgerId(input.provider ?? undefined),
    provider: input.provider || null,
    nativeSessionId: input.nativeSessionId || null,
    model: input.model || null,
    syncedThroughMessageCount: isFiniteNumber(input.syncedThroughMessageCount) ? input.syncedThroughMessageCount : 0,
    createdAt: created,
    updatedAt: isFiniteNumber(input.updatedAt) ? input.updatedAt : created,
    origin: input.origin ?? "unknown",
  };
}

function normalizeConversationSession(session: SessionInput | null | undefined, archivedMessageCount = 0): ConversationSession | null {
  if (!session?.provider) return null;
  return createConversationSession({
    ...session,
    syncedThroughMessageCount: isFiniteNumber(session.syncedThroughMessageCount)
      ? session.syncedThroughMessageCount
      : archivedMessageCount,
  });
}

function buildProviderSessionLookup(sessions: readonly ConversationSession[]): Partial<Record<ModelProviderId, string>> {
  const providerSessions: Partial<Record<ModelProviderId, string>> = {};
  for (const session of sortConversationSessions(sessions)) {
    if (!session.provider || !session.nativeSessionId || providerSessions[session.provider]) continue;
    providerSessions[session.provider] = session.nativeSessionId;
  }
  return providerSessions;
}

function normalizeArchivedMessages(messages: unknown): ChatMessage[] {
  if (!Array.isArray(messages)) return [];
  return (messages as ChatMessage[])
    .filter((message): message is ChatMessage => Boolean(message))
    .map((message) => sanitizeArchivedMessage(stripTransientMessageState(message)))
    .filter(isNonEmptyArchivedMessage);
}

/**
 * Normalize a conversation (possibly persisted by an older version): clean
 * its transcript, migrate legacy `sessionId`/`providerSessions` fields into
 * the ledger, dedupe sessions and derive the active-session fields.
 */
export function normalizeConversationState(conversation: Conversation): Conversation {
  const archivedMessages = normalizeArchivedMessages(conversation.archivedMessages);
  const archivedMessageCount = archivedMessages.length;
  const sessionMap = new Map<string, ConversationSession>();

  for (const rawSession of Array.isArray(conversation.sessions) ? conversation.sessions : []) {
    const session = normalizeConversationSession(rawSession, archivedMessageCount);
    if (!session) continue;
    const key = session.nativeSessionId ? `${session.provider}:${session.nativeSessionId}` : `id:${session.id}`;
    const existing = sessionMap.get(key);
    if (!existing || (session.updatedAt || 0) >= (existing.updatedAt || 0)) sessionMap.set(key, session);
  }

  const legacyProviderSessions: Partial<Record<string, string>> = { ...(conversation.providerSessions ?? {}) };
  if (conversation.sessionId && conversation.sessionProvider && !legacyProviderSessions[conversation.sessionProvider]) {
    legacyProviderSessions[conversation.sessionProvider] = conversation.sessionId;
  }

  for (const [provider, nativeSessionId] of Object.entries(legacyProviderSessions)) {
    if (!provider || !nativeSessionId) continue;
    const key = `${provider}:${nativeSessionId}`;
    if (!sessionMap.has(key)) {
      sessionMap.set(key, createConversationSession({
        // Persisted provider ids are kept verbatim (forward-compatible with newer providers).
        provider: provider as ModelProviderId,
        nativeSessionId,
        model: conversation.model || null,
        syncedThroughMessageCount: archivedMessageCount,
        createdAt: conversation.ts,
        updatedAt: conversation.ts,
        origin: "legacy",
      }));
    }
  }

  if (conversation.sessionId && !conversation.sessionProvider) {
    const fallbackProvider = conversation.lastProvider || conversation.provider || null;
    if (fallbackProvider) {
      const key = `${fallbackProvider}:${conversation.sessionId}`;
      if (!sessionMap.has(key)) {
        sessionMap.set(key, createConversationSession({
          provider: fallbackProvider,
          nativeSessionId: conversation.sessionId,
          model: conversation.model || null,
          syncedThroughMessageCount: archivedMessageCount,
          createdAt: conversation.ts,
          updatedAt: conversation.ts,
          origin: "legacy-primary",
        }));
      }
    }
  }

  const sessions = sortConversationSessions([...sessionMap.values()]);
  let activeSession = sessions.find((session) => session.id === conversation.activeSessionId) ?? null;
  if (!activeSession && conversation.sessionId) {
    activeSession = sessions.find((session) => session.nativeSessionId === conversation.sessionId) ?? null;
  }
  if (!activeSession && conversation.lastProvider) {
    activeSession = sessions.find((session) => session.provider === conversation.lastProvider) ?? null;
  }
  activeSession ??= sessions[0] ?? null;

  return {
    ...conversation,
    archivedMessages,
    sessions,
    activeSessionId: activeSession?.id || null,
    providerSessions: buildProviderSessionLookup(sessions),
    sessionId: activeSession?.nativeSessionId || null,
    sessionProvider: activeSession?.provider || null,
    lastProvider:
      conversation.lastProvider ||
      (archivedMessageCount > 0 ? activeSession?.provider || undefined : undefined),
  };
}

export function getConversationSessions(conversation: Conversation | null | undefined): ConversationSession[] {
  return sortConversationSessions(conversation?.sessions ?? []);
}

export function getActiveConversationSession(conversation: Conversation | null | undefined): ConversationSession | null {
  if (!conversation) return null;
  return getConversationSessions(conversation).find((session) => session.id === conversation.activeSessionId) ?? null;
}

export function getLatestSessionForProvider(
  conversation: Conversation | null | undefined,
  provider: ModelProviderId | null | undefined,
  { requireNative = false }: { requireNative?: boolean } = {},
): ConversationSession | null {
  if (!conversation || !provider) return null;
  return (
    getConversationSessions(conversation).find(
      (session) => session.provider === provider && (!requireNative || Boolean(session.nativeSessionId)),
    ) ?? null
  );
}

/** Native session id to load when opening a conversation. */
export function getPreferredLoadSessionId(conversation: Conversation | null | undefined): string | null {
  if (!conversation) return null;
  const activeSession = getActiveConversationSession(conversation);
  if (activeSession?.nativeSessionId) return activeSession.nativeSessionId;

  const lastProviderSession = conversation.lastProvider
    ? getLatestSessionForProvider(conversation, conversation.lastProvider, { requireNative: true })
    : null;
  if (lastProviderSession?.nativeSessionId) return lastProviderSession.nativeSessionId;

  return getConversationSessions(conversation).find((session) => session.nativeSessionId)?.nativeSessionId ?? null;
}

export function getStoredConversationMessageCount(conversation: Conversation | null | undefined): number {
  if (!conversation) return 0;
  const archivedMessageCount = Array.isArray(conversation.archivedMessages) ? conversation.archivedMessages.length : 0;
  const syncedMessageCount = Array.isArray(conversation.sessions)
    ? conversation.sessions.reduce((max, session) => Math.max(max, session.syncedThroughMessageCount || 0), 0)
    : 0;
  return Math.max(archivedMessageCount, syncedMessageCount);
}

export function hasConversationMessages(
  conversation: Conversation | null | undefined,
  conversationData?: Pick<ConversationData, "messages"> | null,
): boolean {
  const liveMessageCount = Array.isArray(conversationData?.messages) ? conversationData.messages.length : 0;
  return Math.max(getStoredConversationMessageCount(conversation), liveMessageCount) > 0;
}

export interface UpsertSessionOptions {
  activate?: boolean;
  /** Reuse the active session if it is a not-yet-native session of the same provider. */
  preferPendingActive?: boolean;
  lastProvider?: ModelProviderId;
}

/** Insert or merge a session into the ledger (matched by id, then provider+native id). */
export function upsertConversationSession(
  conversation: Conversation,
  sessionInput: SessionInput | null | undefined,
  { activate = true, preferPendingActive = false, lastProvider }: UpsertSessionOptions = {},
): Conversation {
  if (!sessionInput?.provider) return normalizeConversationState(conversation);

  const current = normalizeConversationState(conversation);
  const sessions = [...getConversationSessions(current)];
  const candidate = normalizeConversationSession(sessionInput, current.archivedMessages.length);
  if (!candidate) return current;

  // A candidate built without an explicit id gets a fresh ledger id, which
  // never matches; matching by id only makes sense for caller-provided ids.
  let matchIndex = sessionInput.id ? sessions.findIndex((session) => session.id === candidate.id) : -1;
  if (matchIndex === -1 && candidate.nativeSessionId) {
    matchIndex = sessions.findIndex(
      (session) => session.provider === candidate.provider && session.nativeSessionId === candidate.nativeSessionId,
    );
  }
  if (matchIndex === -1 && preferPendingActive) {
    const activeSession = getActiveConversationSession(current);
    matchIndex = sessions.findIndex(
      (session) =>
        session.id === activeSession?.id &&
        session.provider === candidate.provider &&
        !session.nativeSessionId,
    );
  }

  let activeSessionId = current.activeSessionId || null;
  const existing = matchIndex >= 0 ? sessions[matchIndex] : undefined;
  if (existing) {
    const merged = createConversationSession({
      ...existing,
      ...candidate,
      id: existing.id,
      provider: candidate.provider || existing.provider,
      nativeSessionId: candidate.nativeSessionId || existing.nativeSessionId,
      model: candidate.model || existing.model,
      syncedThroughMessageCount: Math.max(existing.syncedThroughMessageCount || 0, candidate.syncedThroughMessageCount || 0),
      createdAt: existing.createdAt,
      updatedAt: Math.max(existing.updatedAt || 0, candidate.updatedAt || 0, Date.now()),
      origin: candidate.origin || existing.origin,
    });
    sessions[matchIndex] = merged;
    if (activate) activeSessionId = merged.id;
  } else {
    const created = createConversationSession(candidate);
    sessions.unshift(created);
    if (activate) activeSessionId = created.id;
  }

  return normalizeConversationState({
    ...current,
    sessions,
    activeSessionId,
    ...(lastProvider ? { lastProvider } : {}),
  });
}

export function markConversationSessionSynced(
  conversation: Conversation,
  sessionId: string | null | undefined,
  syncedThroughMessageCount: number,
): Conversation {
  if (!sessionId || !Number.isFinite(syncedThroughMessageCount)) return normalizeConversationState(conversation);
  return normalizeConversationState({
    ...conversation,
    sessions: getConversationSessions(conversation).map((session) =>
      session.id === sessionId ? { ...session, syncedThroughMessageCount, updatedAt: Date.now() } : session,
    ),
  });
}

export function createSeedSession(
  conversation: Conversation,
  provider: ModelProviderId,
  { model, syncedThroughMessageCount = 0, origin = "fresh" }: { model?: string | null; syncedThroughMessageCount?: number; origin?: ConversationSessionOrigin } = {},
): ConversationSession {
  const runtimeProvider = getRuntimeProviderForProvider(provider);
  return createConversationSession({
    provider,
    nativeSessionId: runtimeProvider === "claude" ? crypto.randomUUID() : null,
    model: model || conversation.model || null,
    syncedThroughMessageCount,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    origin,
  });
}
