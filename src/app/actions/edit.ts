/** Edit-and-resend of a user message in the active conversation. */

import { resolveEffort } from "@shared/models/registry";
import { getAppSettings } from "../../store/appSettings";
import { getActiveConvo } from "../../store/convoList";
import { ensureTranscriptLoaded } from "../../store/persistence";
import { buildConversationPrime, buildCrossProviderPrime, decoratePromptWithPrime } from "../../utils/crossProviderPrime";
import { getEffectiveConversationCwd } from "../conversation/paths";
import { createConversationSession, getActiveConversationSession, normalizeConversationState } from "../conversation/sessions";
import { getApi } from "../lib/api";
import { logCheckpoint, logSendFlow } from "../log";
import {
  getModelThinkingValue,
  getOpenCodeRuntimeConfig,
  getProviderUpstreamRuntimeConfig,
  getRemoteRuntimeConfigForModel,
  getRuntimeProviderForModel,
} from "../models/runtime";
import { getAgentApi, getLiveConversation } from "../stores/live";
import { getModels, resolveModel } from "../stores/models";
import { getUi } from "../stores/ui";
import type { MulticaContext } from "@shared/providers/types";
import { buildMulticaBootstrapPrompt, ensureMulticaContextForConversation } from "./multica";
import { resolveProjectContext } from "./projectContext";
import { recordRunSession } from "./send";
import { resolveConversationLastProvider, resolveConversationProviderSession } from "./sessionResolution";

/** Message `onEdit`: restore the checkpoint, then fork the session with the new text. */
export async function editAndResendMessage(messageIndex: number, newText: string): Promise<void> {
  const activeConvo = getActiveConvo();
  if (!activeConvo) return;
  const active = activeConvo.id;
  await ensureTranscriptLoaded(active);
  const normalized = normalizeConversationState(getActiveConvo() ?? activeConvo);
  const m = resolveModel(normalized.model);
  const convoCwd = getEffectiveConversationCwd(normalized, getAppSettings().cwd, getUi().draftsPath);
  const currentMessages = getLiveConversation(active).messages;
  const api = getApi();

  // Restore the git checkpoint taken before this message.
  const checkpointRef = normalized.checkpoints?.[messageIndex];
  logCheckpoint("handleEdit", { convoId: active, messageIndex, checkpointRef: checkpointRef || null, convoCwd });
  if (checkpointRef && convoCwd && api) {
    try {
      await api.checkpointRestore(convoCwd, checkpointRef);
    } catch (e) {
      console.error("Checkpoint restore failed:", e);
    }
  }

  const currentProvider = m.provider;
  const runtimeProvider = getRuntimeProviderForModel(m);
  const activeSession = getActiveConversationSession(normalized);
  const prevProvider = await resolveConversationLastProvider(normalized);
  const currentProviderSession = await resolveConversationProviderSession(normalized, currentProvider);
  // Like a mid-chat send: if the last turn used another provider, prime.
  const providerSwitched = Boolean(prevProvider) && prevProvider !== currentProvider;
  const canResumeExistingSession =
    prevProvider === currentProvider &&
    Boolean(currentProviderSession?.nativeSessionId) &&
    currentProviderSession?.syncedThroughMessageCount === currentMessages.length;
  const priorMessages = currentMessages.slice(0, messageIndex);
  const needsHistoryPrimeFallback = !providerSwitched && !canResumeExistingSession;
  const seededEditSession = canResumeExistingSession
    ? null
    : createConversationSession({
        provider: currentProvider,
        nativeSessionId: null,
        model: normalized.model,
        syncedThroughMessageCount: priorMessages.length,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        origin: providerSwitched ? "handoff-edit" : "resync-edit",
      });
  const prime = providerSwitched
    ? buildCrossProviderPrime(priorMessages)
    : needsHistoryPrimeFallback
      ? buildConversationPrime(priorMessages)
      : null;
  const primedPrompt = prime ? decoratePromptWithPrime(newText, prime) : newText;
  const resumeSessionId = canResumeExistingSession ? currentProviderSession?.nativeSessionId ?? undefined : undefined;

  logSendFlow("handleEdit:start", {
    conversationId: active,
    currentProvider,
    runtimeProvider,
    prevProvider: prevProvider || null,
    providerSwitched,
    sessionId: normalized.sessionId || null,
    sessionProvider: normalized.sessionProvider || null,
    providerSessions: normalized.providerSessions,
    activeSessionId: normalized.activeSessionId || null,
    activeSession,
    currentProviderSession,
    resumeSessionId: resumeSessionId ?? null,
    primeMode: providerSwitched ? "cross-provider" : needsHistoryPrimeFallback ? "history-fallback" : null,
  });

  let multicaContext: MulticaContext | undefined;
  let multicaToken: string | undefined;
  if (currentProvider === "multica") {
    ({ context: multicaContext, token: multicaToken } = await ensureMulticaContextForConversation({
      conversationId: active,
      conversation: activeConvo,
      normalizedConversation: normalized,
      modelId: normalized.model,
      title: normalized.title || newText.slice(0, 60),
      forceNewSession: true,
    }));
  }
  const wirePrompt = currentProvider === "multica" ? await buildMulticaBootstrapPrompt(convoCwd, primedPrompt) : primedPrompt;

  const started = getAgentApi().editAndResend({
    conversationId: active,
    sessionId: resumeSessionId,
    messageIndex,
    newText,
    wirePrompt,
    model: m.cliFlag,
    provider: currentProvider,
    runtimeProvider,
    effort: resolveEffort(m, normalized.effort) ?? undefined,
    thinking: getModelThinkingValue(m),
    openCodeConfig: getOpenCodeRuntimeConfig(m),
    providerUpstreamConfig: getProviderUpstreamRuntimeConfig(currentProvider, getModels().getProviderUpstreamConfig),
    grokContinue: Boolean(normalized.grokContinue || ("grokContinue" in m && m.grokContinue)) || undefined,
    remoteRuntime: getRemoteRuntimeConfigForModel(m),
    cwd: convoCwd,
    projectContext: resolveProjectContext(convoCwd),
    multicaContext,
    multicaToken,
  });
  if (started) recordRunSession(active, currentProvider, seededEditSession, currentProviderSession);
}
