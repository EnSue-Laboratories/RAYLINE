/** Multica run lifecycle: subscribe, upload attachments, send, cancel, re-subscribe. */

import type { AgentStartRequest } from "@shared/chat/types";
import type { MulticaContext, MulticaSubscribeArgs } from "@shared/providers/types";
import type { AgentEventSink } from "../../agent-sink";
import { createLogger } from "../common/boundary";
import { donePayload } from "../common/done";
import { errorMessage } from "../common/json";
import { multicaSendMessage } from "./api";
import { buildMulticaAttachmentPrompt, uploadMulticaAttachments } from "./attachments";
import { emitMulticaDone, emitMulticaError, findSubscriptions, getOrOpenWS, requestTaskCancel, retryPendingCancel, type MulticaSubscription } from "./ws-pool";

const log = createLogger("multica-manager");

function newSubscription(conversationId: string, context: MulticaContext, sink: AgentEventSink, startRequestComplete: boolean): MulticaSubscription {
  return {
    conversationId,
    sessionId: context.sessionId,
    workspaceSlug: context.workspaceSlug,
    sink,
    taskId: null,
    startRequestComplete,
    cancelRequested: false,
    cancelPromise: null,
    doneEmitted: false,
  };
}

/**
 * Sends a message to the bound Multica chat session; the reply streams back
 * over the workspace WebSocket. Failures are reported on the sink
 * (`multica:error` + `agent-done` with exit code -1) and never reject.
 */
export async function startMulticaAgent(request: AgentStartRequest, sink: AgentEventSink): Promise<void> {
  const { conversationId } = request;
  try {
    const context = request._multica;
    if (!context) throw new Error("startMulticaAgent: missing _multica context");
    const token = request._multicaToken;
    if (!token) throw new Error("startMulticaAgent: missing token");
    const { serverUrl, workspaceId, workspaceSlug, sessionId } = context;

    const entry = await getOrOpenWS(serverUrl, workspaceId, token);
    entry.subscriptions.set(conversationId, newSubscription(conversationId, context, sink, false));

    const auth = { serverUrl, token, workspaceId, workspaceSlug };
    const attachments = await uploadMulticaAttachments(auth, request.images, request.files);
    const content = buildMulticaAttachmentPrompt(request.prompt, attachments);
    // Fire the message via REST — the actual content comes back over WS.
    const sendResult = await multicaSendMessage({ ...auth, sessionId, content });

    const sub = entry.subscriptions.get(conversationId);
    if (sub) {
      sub.startRequestComplete = true;
      sub.taskId = sendResult.task_id || sub.taskId;
      if (sub.cancelRequested) retryPendingCancel(entry, sub);
    }
  } catch (err) {
    const message = errorMessage(err);
    log("Multica start failed:", message);
    sink.stream({ conversationId, event: { type: "multica:error", payload: { message } } });
    sink.done(donePayload("multica", conversationId, -1));
  }
}

export async function cancelMulticaAgent(conversationId: string): Promise<void> {
  const matches = findSubscriptions(conversationId);
  await Promise.all(
    matches.map(async ({ entry, sub }) => {
      try {
        const didCancel = await requestTaskCancel(entry, sub);
        if (!didCancel && sub.startRequestComplete) emitMulticaDone(sub, null, "SIGTERM");
      } catch (err) {
        emitMulticaError(sub, errorMessage(err));
        emitMulticaDone(sub, null, "SIGTERM");
      }
    }),
  );
}

/**
 * Re-registers a conversation's subscription after the pool was emptied
 * (app restart / socket close). Click-to-reconnect from the renderer.
 */
export async function subscribeMulticaAgent({ conversationId, _multica, token }: MulticaSubscribeArgs, sink: AgentEventSink): Promise<void> {
  if (!_multica) throw new Error("subscribeMulticaAgent: missing _multica context");
  if (!token) throw new Error("subscribeMulticaAgent: missing token");
  const entry = await getOrOpenWS(_multica.serverUrl, _multica.workspaceId, token);
  entry.subscriptions.set(conversationId, newSubscription(conversationId, _multica, sink, true));
}
