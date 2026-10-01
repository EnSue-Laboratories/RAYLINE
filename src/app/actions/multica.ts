/** Multica session binding, bootstrap prompt and reconnect/backfill. */

import type { ChatMessage, Conversation } from "@shared/chat/types";
import type { MulticaChatMessage, MulticaContext } from "@shared/providers/types";
import { getMulticaAgentIdFromModelId } from "@shared/models/ids";
import { findConvo, updateConvo } from "../../store/convoList";
import { loadMulticaState } from "../../multica/store";
import {
  areArchivedMessageListsEqual,
  collapseRepeatedRemoteBackfill,
  hydrateArchivedAttachmentMetadata,
  isArchivedMessagePrefix,
  isNonEmptyArchivedMessage,
  mergeArchivedMessages,
  stripInjectedPromptMetadata,
} from "../conversation/archive";
import { buildMulticaSetupBlock, getMulticaContextForAgent, normalizeMulticaContext, withMulticaContext } from "../conversation/multica";
import { normalizeConversationState } from "../conversation/sessions";
import { errorMessage, getApi } from "../lib/api";
import { getAgentApi, getLiveConversation } from "../stores/live";

export interface EnsureMulticaContextInput {
  conversationId: string;
  conversation: Conversation;
  normalizedConversation: Conversation;
  modelId: string;
  title: string;
  forceNewSession?: boolean;
}

/**
 * The Multica chat session for this conversation's selected agent: reuse the
 * stored binding when the workspace still matches, else create a session.
 * Must run before `prepareMessage` so failures don't leave an orphan bubble.
 */
export async function ensureMulticaContextForConversation({
  conversationId,
  conversation,
  normalizedConversation,
  modelId,
  title,
  forceNewSession = false,
}: EnsureMulticaContextInput): Promise<{ context: MulticaContext; token: string }> {
  const agentId = getMulticaAgentIdFromModelId(modelId);
  if (!agentId) throw new Error(`Invalid Multica model id: ${modelId}`);
  const mState = loadMulticaState();
  const token = mState.token;
  if (!token) throw new Error("Multica not authenticated (no token)");
  if (!mState.serverUrl) throw new Error("Multica server URL is missing");
  if (!mState.workspaceId && !mState.workspaceSlug) throw new Error("Multica workspace is not configured");

  const activeExisting =
    normalizeMulticaContext(normalizedConversation._multica) || normalizeMulticaContext(conversation._multica);
  const existing = getMulticaContextForAgent(normalizedConversation, agentId);
  const desiredServerUrl = mState.serverUrl;
  const desiredWorkspaceId = mState.workspaceId || existing?.workspaceId || activeExisting?.workspaceId || "";
  const desiredWorkspaceSlug = mState.workspaceSlug || existing?.workspaceSlug || activeExisting?.workspaceSlug || "";

  if (existing) {
    const hydrated: MulticaContext = {
      ...existing,
      serverUrl: desiredServerUrl,
      workspaceId: desiredWorkspaceId,
      workspaceSlug: desiredWorkspaceSlug,
    };
    const workspaceChanged =
      existing.serverUrl !== desiredServerUrl ||
      Boolean(existing.workspaceId && desiredWorkspaceId && existing.workspaceId !== desiredWorkspaceId) ||
      Boolean(existing.workspaceSlug && desiredWorkspaceSlug && existing.workspaceSlug !== desiredWorkspaceSlug);
    const shouldPersistHydrated =
      hydrated.serverUrl !== existing.serverUrl ||
      hydrated.workspaceId !== existing.workspaceId ||
      hydrated.workspaceSlug !== existing.workspaceSlug ||
      activeExisting?.agentId !== hydrated.agentId ||
      activeExisting?.sessionId !== hydrated.sessionId;

    if (
      !forceNewSession &&
      !workspaceChanged &&
      hydrated.agentId === agentId &&
      hydrated.sessionId &&
      hydrated.serverUrl &&
      (hydrated.workspaceId || hydrated.workspaceSlug)
    ) {
      if (shouldPersistHydrated) updateConvo(conversationId, (c) => withMulticaContext(c, hydrated));
      return { context: hydrated, token };
    }
  }

  const api = getApi();
  if (!api) throw new Error("Multica is unavailable outside the desktop app");
  const session = await api.multicaEnsureSession({
    serverUrl: desiredServerUrl,
    token,
    workspaceId: desiredWorkspaceId,
    workspaceSlug: desiredWorkspaceSlug,
    agentId,
    title: title || "RayLine chat",
  });
  const context: MulticaContext = {
    serverUrl: desiredServerUrl,
    workspaceSlug: desiredWorkspaceSlug,
    workspaceId: desiredWorkspaceId,
    agentId,
    sessionId: session.id,
  };
  updateConvo(conversationId, (c) => withMulticaContext(c, context));
  return { context, token };
}

/** Prepend the declared git context (remote, branch, upstream) to a Multica prompt. */
export async function buildMulticaBootstrapPrompt(effectiveCwd: string | undefined, prompt: string): Promise<string> {
  const api = getApi();
  if (!effectiveCwd || !api) return prompt;

  const [status, remoteSlug, remoteResult] = await Promise.all([
    api.gitStatus(effectiveCwd).catch(() => null),
    api.gitRemoteSlug(effectiveCwd).catch(() => null),
    api.shellRun({ command: "git remote get-url origin", cwd: effectiveCwd }).catch(() => null),
  ]);

  const stdout = remoteResult?.stdout.trim() ?? "";
  const remoteUrl = remoteResult?.exitCode === 0 && stdout ? stdout : remoteSlug ? `https://github.com/${remoteSlug}.git` : "";
  const setup = buildMulticaSetupBlock({
    remoteUrl,
    remoteSlug,
    branch: status?.branch || "",
    upstream: status?.upstream || "",
    detached: Boolean(status?.detached),
  });
  return setup ? `${setup}\n\n${prompt}` : prompt;
}

function toArchivedMessage(m: MulticaChatMessage): ChatMessage {
  const role = m.role === "user" ? "user" : "assistant";
  const rawText = typeof m.content === "string" ? m.content : JSON.stringify(m.content ?? "");
  if (role === "user") {
    return { id: `multica-${String(m.id)}`, role, text: stripInjectedPromptMetadata(rawText), _multicaId: m.id };
  }
  return { id: `multica-${String(m.id)}`, role, parts: [{ type: "text", text: rawText }], _multicaId: m.id };
}

function authStatus(error: unknown): number | null {
  if (typeof error === "object" && error !== null && "status" in error && typeof error.status === "number") {
    return error.status;
  }
  // `err.status` does not survive IPC serialization; parse the message.
  const match = /\b(401|403)\b/.exec(errorMessage(error));
  return match ? Number(match[1]) : null;
}

/**
 * Resume a Multica conversation after restart / WS loss: re-subscribe and
 * backfill transcript messages that landed while disconnected.
 */
export async function reconnectMulticaConversation(conversationId: string, multicaCtx: MulticaContext): Promise<void> {
  const api = getApi();
  if (!conversationId || !api) return;
  const { token } = loadMulticaState();
  if (!token) throw new Error("Multica not authenticated (no token)");
  const { serverUrl, workspaceId, workspaceSlug, sessionId } = multicaCtx;
  const agent = getAgentApi();

  try {
    await api.multicaSubscribe({ conversationId, _multica: multicaCtx, token });
    agent.markMulticaConnected(conversationId);

    const remote = await api.multicaListMessages({ serverUrl, token, workspaceId, workspaceSlug, sessionId });
    const list = Array.isArray(remote) ? remote : remote.messages || remote.data || [];
    // Same archived shape the WS path builds so the signature-based dedupe aligns them.
    const mapped = list
      .filter((m) => m.id != null)
      .map(toArchivedMessage)
      .filter(isNonEmptyArchivedMessage);
    if (mapped.length === 0) return;

    const liveMessages = getLiveConversation(conversationId).messages;
    const stored = findConvo(conversationId);
    const persistedMessages = stored ? normalizeConversationState(stored).archivedMessages : [];
    const baseMessages = liveMessages.length > 0 ? liveMessages : persistedMessages;
    const hydratedMapped = hydrateArchivedAttachmentMetadata(baseMessages, mapped);
    const repairedBase = collapseRepeatedRemoteBackfill(baseMessages, hydratedMapped);
    const merged = mergeArchivedMessages(repairedBase, hydratedMapped);

    if (areArchivedMessageListsEqual(liveMessages, merged)) return;
    if (liveMessages.length > 0 && isArchivedMessagePrefix(liveMessages, merged)) {
      const tail = merged.slice(liveMessages.length);
      if (tail.length > 0) agent.appendLocalMessages(conversationId, tail);
      return;
    }
    agent.replaceMessages(conversationId, merged);
  } catch (err) {
    const status = authStatus(err);
    if (status === 401 || status === 403) {
      window.dispatchEvent(new CustomEvent("open-multica-setup"));
      throw new Error("Session expired — please reconnect Multica.");
    }
    throw err;
  }
}
