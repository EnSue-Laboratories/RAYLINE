/** agent-start / agent-cancel / agent-edit-resend / agent-permission-respond. */

import type { RuntimeProviderId } from "@shared/providers/types";
import { respondPermission } from "../agent-manager";
import { webContentsSink, type AgentEventSink } from "../agent-sink";
import { AGENT_RUNTIMES, cancelEverywhere, resolveRuntimeProvider } from "../app/agent-runtimes";
import { errorMessage } from "../services/errors";
import { on } from "./typed";

function reportLaunchError(sink: AgentEventSink, conversationId: string | undefined, err: unknown, provider: RuntimeProviderId): void {
  if (!conversationId || sink.isClosed()) return;
  const error = errorMessage(err);
  console.error("[agent] launch failed:", error);
  if (provider === "multica") {
    sink.stream({ conversationId, event: { type: "multica:error", payload: { message: error } } });
    sink.done({ conversationId, provider, exitCode: -1 });
    return;
  }
  sink.error({ conversationId, error });
  sink.done({ conversationId, exitCode: -1, provider });
}

function launch(run: () => unknown, sink: AgentEventSink, conversationId: string | undefined, provider: RuntimeProviderId): void {
  Promise.resolve()
    .then(run)
    .catch((err: unknown) => reportLaunchError(sink, conversationId, err, provider));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function registerAgentIpc(): void {
  on("agent-start", (event, request) => {
    if (!isRecord(request)) return;
    const provider = resolveRuntimeProvider(request);
    const sink = webContentsSink(event.sender);
    launch(() => AGENT_RUNTIMES[provider].start(request, sink), sink, request.conversationId, provider);
  });

  on("agent-edit-resend", (event, request) => {
    if (!isRecord(request)) return;
    const provider = resolveRuntimeProvider(request);
    const sink = webContentsSink(event.sender);
    // Multica edits run through Claude (see AGENT_RUNTIMES.multica); report as Claude.
    const reportAs = provider === "multica" ? "claude" : provider;
    launch(() => AGENT_RUNTIMES[provider].editResend(request, sink), sink, request.conversationId, reportAs);
  });

  on("agent-cancel", (_event, request) => {
    // Older preloads forwarded a bare id; the contract is `{ conversationId }`.
    const raw: unknown = request;
    const conversationId = typeof raw === "string" ? raw : isRecord(raw) && typeof raw.conversationId === "string" ? raw.conversationId : "";
    if (conversationId) cancelEverywhere(conversationId);
  });

  on("agent-permission-respond", (_event, response) => {
    try {
      respondPermission(response);
    } catch (err) {
      console.error("[agent] permission respond failed:", errorMessage(err));
    }
  });
}
