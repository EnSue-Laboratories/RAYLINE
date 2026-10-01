/**
 * Send pipeline for one conversation: cwd recovery, provider/session
 * resolution (resume vs. fresh session vs. primed handoff), Multica
 * binding, checkpoint, then `agent-start`.
 */

import type { Attachment, Conversation, ConversationSession, FileAttachment, ImagePayload } from "@shared/chat/types";
import { resolveEffort } from "@shared/models/registry";
import { getMulticaAgentIdFromModelId } from "@shared/models/ids";
import { getAppSettings } from "../../store/appSettings";
import { findConvo, updateConvo } from "../../store/convoList";
import { ensureTranscriptLoaded } from "../../store/persistence";
import { buildConversationPrime, buildCrossProviderPrime, decoratePromptWithPrime } from "../../utils/crossProviderPrime";
import { buildMissingCwdReminder, decoratePromptWithReminder } from "../../utils/cwdRecovery";
import type { CwdRecoveryMarker } from "@shared/chat/types";
import { conversationHasInjectedPromptMetadata } from "../conversation/archive";
import { getMulticaContextForAgent, normalizeMulticaContext } from "../conversation/multica";
import { getEffectiveConversationCwd } from "../conversation/paths";
import { deriveConversationTitle } from "../conversation/titles";
import {
  createSeedSession,
  getActiveConversationSession,
  normalizeConversationState,
  upsertConversationSession,
  type SessionInput,
} from "../conversation/sessions";
import { errorMessage, getApi } from "../lib/api";
import { logCheckpoint, logSendFlow } from "../log";
import {
  getModelThinkingValue,
  getOpenCodeRuntimeConfig,
  getProviderUpstreamRuntimeConfig,
  getRemoteRuntimeConfigForModel,
  getRuntimeProviderForModel,
} from "../models/runtime";
import { getModels, resolveModel } from "../stores/models";
import { getAgentApi, getLiveConversation } from "../stores/live";
import { sendInFlight } from "../stores/queue";
import { isRuntimeProviderAvailable, refreshCliInstalled } from "../stores/runtime";
import { getUi } from "../stores/ui";
import { buildMulticaBootstrapPrompt, ensureMulticaContextForConversation } from "./multica";
import { resolveProjectContext } from "./projectContext";
import { recoveryMarker, healConversationCwdIfMissing, resolveConversationLastProvider, resolveConversationProviderSession } from "./sessionResolution";
import type { ModelProviderId, MulticaContext } from "@shared/providers/types";

export interface SendToConversationInput {
  conversationId: string;
  conversation: Conversation;
  text: string;
  attachments?: Attachment[];
  titleText?: string;
}

/** Re-probe installed CLIs / OpenCode models (runtime setup card). */
export function refreshRuntimeSetup(): void {
  void refreshCliInstalled({ force: true });
  getModels().refreshOpenCodeModels();
}

function splitAttachments(attachments: Attachment[] | undefined): { images: ImagePayload[]; files: FileAttachment[] } {
  const images: ImagePayload[] = [];
  const files: FileAttachment[] = [];
  for (const a of attachments ?? []) {
    if (a.type === "image" && typeof a.dataUrl === "string") {
      images.push({
        dataUrl: a.dataUrl,
        ...(typeof a.name === "string" ? { name: a.name } : {}),
        ...(typeof a.path === "string" ? { path: a.path } : {}),
        ...(typeof a.storagePath === "string" ? { storagePath: a.storagePath } : {}),
        ...(typeof a.mime === "string" ? { mime: a.mime } : {}),
      });
    } else if (a.type === "file") {
      files.push(a);
    }
  }
  return { images, files };
}

async function createCheckpoint(effectiveCwd: string, conversationId: string, messageIndex: number, sendStartedAt: number): Promise<void> {
  const api = getApi();
  if (!api) return;
  const checkpointStartedAt = Date.now();
  logCheckpoint("checkpointCreate:start", { cwdPath: effectiveCwd, conversationId, messageIndex });
  try {
    const cp = await api.checkpointCreate(effectiveCwd);
    logCheckpoint("checkpointCreate:success", {
      cwdPath: effectiveCwd,
      conversationId,
      messageIndex,
      ref: cp.ref || null,
      durationMs: Date.now() - checkpointStartedAt,
      totalElapsedMs: Date.now() - sendStartedAt,
    });
    if (cp.ref) {
      updateConvo(conversationId, (c) => ({ ...c, checkpoints: { ...(c.checkpoints ?? {}), [messageIndex]: cp.ref } }));
    }
  } catch (e) {
    logCheckpoint("checkpointCreate:failed", {
      cwdPath: effectiveCwd,
      conversationId,
      messageIndex,
      durationMs: Date.now() - checkpointStartedAt,
      totalElapsedMs: Date.now() - sendStartedAt,
      error: errorMessage(e),
    });
    console.warn("Checkpoint creation failed:", errorMessage(e));
  }
}

/** Activate the session the run used (seeded, resumed, or just record the provider). */
export function recordRunSession(
  conversationId: string,
  providerUsed: ModelProviderId,
  seeded: SessionInput | null,
  resumed: Partial<ConversationSession> | null,
): void {
  updateConvo(conversationId, (c) => {
    const next = normalizeConversationState(c);
    if (seeded) return upsertConversationSession(next, seeded, { activate: true, preferPendingActive: true, lastProvider: providerUsed });
    if (resumed?.id) return normalizeConversationState({ ...next, activeSessionId: resumed.id, lastProvider: providerUsed });
    return normalizeConversationState({ ...next, lastProvider: providerUsed });
  });
}

export async function sendMessageToConversation({
  conversationId,
  conversation,
  text,
  attachments,
  titleText,
}: SendToConversationInput): Promise<boolean> {
  if (!conversationId) return false;
  if (sendInFlight.has(conversationId)) {
    logSendFlow("handleSend:skip-concurrent-start", { conversationId });
    return false;
  }
  sendInFlight.add(conversationId);

  try {
    // A v2 transcript may still be on disk; the history decides resume vs. prime.
    await ensureTranscriptLoaded(conversationId);
    const latest = findConvo(conversationId);
    const base: Conversation = latest ? { ...conversation, ...latest } : conversation;

    // Live cwd check (select-time heal covers most cases, but the directory
    // may have vanished between select and send).
    const recovery = await healConversationCwdIfMissing(conversationId, base);
    const pendingRecovery = base.pendingCwdRecovery ?? null;
    const reminderSource: CwdRecoveryMarker | null = recovery?.wasMissing ? recoveryMarker(recovery) : pendingRecovery;
    // Consume the pending marker either way; this send accounts for it.
    if (pendingRecovery) updateConvo(conversationId, (c) => ({ ...c, pendingCwdRecovery: undefined }));
    const missingCwdReminder = reminderSource ? buildMissingCwdReminder(reminderSource) : null;

    const { cwd: appCwd } = getAppSettings();
    const effectiveCwd = recovery ? recovery.cwd ?? undefined : getEffectiveConversationCwd(base, appCwd, getUi().draftsPath);
    const liveMessages = getLiveConversation(conversationId).messages;
    const normalized = normalizeConversationState(base);
    const activeSession = getActiveConversationSession(normalized);
    const isFirstMessage = liveMessages.length === 0;
    const messageIndex = liveMessages.length;
    const syncedMessageCount = liveMessages.length;
    const { images: imageAttachments, files } = splitAttachments(attachments);

    const m = resolveModel(normalized.model);
    const currentProvider = m.provider;
    const runtimeProvider = getRuntimeProviderForModel(m);
    const remoteRuntime = getRemoteRuntimeConfigForModel(m);
    if (!isRuntimeProviderAvailable(currentProvider, m)) {
      refreshRuntimeSetup();
      return false;
    }

    // Multica context must be resolved BEFORE prepareMessage so a missing
    // context doesn't leave an orphan streaming assistant bubble.
    const isMultica = currentProvider === "multica";
    const multicaSessionPolluted =
      isMultica &&
      (conversationHasInjectedPromptMetadata(normalized.archivedMessages) || conversationHasInjectedPromptMetadata(liveMessages));
    const previousActiveMulticaContext = isMultica
      ? normalizeMulticaContext(normalized._multica) || normalizeMulticaContext(base._multica)
      : null;
    const previousSelectedMulticaContext = isMultica
      ? getMulticaContextForAgent(normalized, getMulticaAgentIdFromModelId(normalized.model))
      : null;
    let multicaContext: MulticaContext | undefined;
    let multicaToken: string | undefined;
    if (isMultica) {
      ({ context: multicaContext, token: multicaToken } = await ensureMulticaContextForConversation({
        conversationId,
        conversation: base,
        normalizedConversation: normalized,
        modelId: normalized.model,
        title: titleText || base.title || normalized.title || text.slice(0, 60),
        forceNewSession: multicaSessionPolluted,
      }));
    }

    const prevProvider = isFirstMessage
      ? normalized.lastProvider || activeSession?.provider || null
      : await resolveConversationLastProvider(normalized);
    const currentProviderSession = await resolveConversationProviderSession(normalized, currentProvider);
    const providerSwitched = !isFirstMessage && Boolean(prevProvider) && prevProvider !== currentProvider;
    const multicaModelSwitched =
      isMultica &&
      !isFirstMessage &&
      prevProvider === "multica" &&
      Boolean(previousActiveMulticaContext?.agentId) &&
      Boolean(multicaContext?.agentId) &&
      previousActiveMulticaContext?.agentId !== multicaContext?.agentId;
    const handoffSwitched = providerSwitched || multicaModelSwitched;
    const sameContext = (a: MulticaContext | null | undefined) =>
      Boolean(a?.sessionId) &&
      Boolean(multicaContext?.sessionId) &&
      a?.sessionId === multicaContext?.sessionId &&
      a?.agentId === multicaContext?.agentId;
    const multicaSessionReused =
      isMultica &&
      !isFirstMessage &&
      prevProvider === "multica" &&
      (sameContext(previousActiveMulticaContext) || (!previousActiveMulticaContext && sameContext(previousSelectedMulticaContext)));
    const canResumeExistingSession =
      !isFirstMessage &&
      (multicaSessionReused ||
        (prevProvider === currentProvider &&
          Boolean(currentProviderSession?.nativeSessionId) &&
          currentProviderSession?.syncedThroughMessageCount === syncedMessageCount));
    const needsHistoryPrimeFallback = !isFirstMessage && !isMultica && !handoffSwitched && !canResumeExistingSession;
    const needsFreshSession =
      isFirstMessage || handoffSwitched || needsHistoryPrimeFallback || (isMultica && !canResumeExistingSession);
    const seedOrigin = isFirstMessage ? "initial-send" : handoffSwitched ? "handoff" : "resync";
    let seededSession: SessionInput | null = null;
    if (needsFreshSession) {
      seededSession =
        isFirstMessage && activeSession?.provider === currentProvider
          ? {
              ...activeSession,
              nativeSessionId:
                runtimeProvider === "claude"
                  ? activeSession.nativeSessionId || crypto.randomUUID()
                  : activeSession.nativeSessionId || null,
              model: normalized.model,
              syncedThroughMessageCount: syncedMessageCount,
              updatedAt: Date.now(),
              origin: seedOrigin,
            }
          : createSeedSession(normalized, currentProvider, {
              model: normalized.model,
              syncedThroughMessageCount: syncedMessageCount,
              origin: seedOrigin,
            });
    }
    const initialSessionId = needsFreshSession && runtimeProvider === "claude" ? seededSession?.nativeSessionId || undefined : undefined;
    const resumeSessionId = currentProviderSession?.nativeSessionId || undefined;
    const prime = handoffSwitched
      ? buildCrossProviderPrime(liveMessages)
      : needsHistoryPrimeFallback
        ? buildConversationPrime(liveMessages)
        : null;
    const decoratedPrompt = decoratePromptWithReminder(prime ? decoratePromptWithPrime(text, prime) : text, missingCwdReminder);
    const wirePrompt = isMultica && needsFreshSession ? await buildMulticaBootstrapPrompt(effectiveCwd, decoratedPrompt) : decoratedPrompt;
    const sendStartedAt = Date.now();

    if (isFirstMessage) {
      const newTitle = deriveConversationTitle(titleText || text, attachments);
      updateConvo(conversationId, (c) => ({ ...c, title: newTitle }));
    }

    logSendFlow("handleSend:start", {
      conversationId,
      effectiveCwd,
      isFirstMessage,
      messageIndex,
      currentProvider,
      runtimeProvider,
      prevProvider: prevProvider || null,
      providerSwitched,
      multicaModelSwitched,
      handoffSwitched,
      sessionId: normalized.sessionId || null,
      sessionProvider: normalized.sessionProvider || null,
      providerSessions: normalized.providerSessions,
      activeSessionId: normalized.activeSessionId || null,
      activeSession,
      currentProviderSession,
      initialSessionId: initialSessionId || null,
      resumeSessionId: canResumeExistingSession ? resumeSessionId || null : null,
      primeMode: providerSwitched
        ? "cross-provider"
        : multicaModelSwitched
          ? "multica-model-handoff"
          : needsHistoryPrimeFallback
            ? "history-fallback"
            : null,
      multicaSessionPolluted,
    });

    const agent = getAgentApi();
    const pendingId = agent.prepareMessage({
      conversationId,
      prompt: text,
      images: imageAttachments.length ? imageAttachments : undefined,
      files: files.length ? files : undefined,
    });
    logSendFlow("handleSend:seeded", { conversationId, pendingId, elapsedMs: Date.now() - sendStartedAt });

    // Git checkpoint before sending (for edit rewind).
    if (effectiveCwd) await createCheckpoint(effectiveCwd, conversationId, messageIndex, sendStartedAt);

    const effortSource = findConvo(conversationId) ?? normalized;
    const started = agent.startPreparedMessage({
      conversationId,
      pendingId,
      sessionId: initialSessionId,
      resumeSessionId: canResumeExistingSession ? resumeSessionId : undefined,
      prompt: wirePrompt,
      model: m.cliFlag,
      provider: currentProvider,
      runtimeProvider,
      effort: resolveEffort(m, effortSource.effort) ?? undefined,
      thinking: getModelThinkingValue(m),
      openCodeConfig: getOpenCodeRuntimeConfig(m),
      providerUpstreamConfig: getProviderUpstreamRuntimeConfig(currentProvider, getModels().getProviderUpstreamConfig),
      grokContinue: Boolean(effortSource.grokContinue || ("grokContinue" in m && m.grokContinue)) || undefined,
      remoteRuntime,
      cwd: effectiveCwd,
      projectContext: resolveProjectContext(effectiveCwd),
      images: isMultica
        ? imageAttachments.length ? imageAttachments : undefined
        : imageAttachments.length ? imageAttachments.map((a) => a.dataUrl) : undefined,
      files: files.length ? files : undefined,
      multicaContext,
      multicaToken,
    });

    if (started) recordRunSession(conversationId, currentProvider, seededSession, currentProviderSession);
    logSendFlow("handleSend:agent-start", { conversationId, pendingId, started, totalElapsedMs: Date.now() - sendStartedAt });
    return started;
  } finally {
    sendInFlight.delete(conversationId);
  }
}
