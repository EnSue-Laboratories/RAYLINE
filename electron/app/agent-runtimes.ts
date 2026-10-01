/**
 * Agent backends by runtime provider id. `agent-start` / `agent-edit-resend`
 * dispatch here, `agent-cancel` and app quit fan out to every backend.
 *
 * The Record is exhaustive over RuntimeProviderId, so adding a provider to
 * shared/providers/types fails to compile until it is wired here.
 */

import type { AgentEventSink } from "../agent-sink";
import type { AgentEditResendRequest, AgentStartRequest } from "@shared/chat/types";
import type { RuntimeProviderId } from "@shared/providers/types";
import * as claude from "../agent-manager";
import * as agy from "../agy-agent-manager";
import * as codex from "../codex-agent-manager";
import * as grok from "../grok-agent-manager";
import * as multica from "../multica-manager";
import * as opencode from "../opencode-agent-manager";
import { errorMessage } from "../services/errors";

export interface AgentRuntime {
  /** May throw or return a rejecting promise; callers report launch failures. */
  readonly start: (request: AgentStartRequest, sink: AgentEventSink) => unknown;
  /** Resume + fork the native session with an edited prompt. */
  readonly editResend: (request: AgentEditResendRequest, sink: AgentEventSink) => unknown;
  readonly cancel: (conversationId: string) => void;
  /** On app quit. */
  readonly cancelAll: () => void;
}

const claudeRuntime: AgentRuntime = {
  start: (request, sink) => claude.startAgent(request, sink),
  editResend: (request, sink) => claude.startAgent({ ...request, forkSession: true }, sink),
  cancel: (conversationId) => claude.cancelAgent(conversationId),
  cancelAll: () => claude.cancelAll(),
};

export const AGENT_RUNTIMES: Readonly<Record<RuntimeProviderId, AgentRuntime>> = {
  claude: claudeRuntime,
  codex: {
    start: (request, sink) => codex.startCodexAgent(request, sink),
    editResend: (request, sink) => codex.startCodexAgent({ ...request, resumeSessionId: request.resumeSessionId }, sink),
    cancel: (conversationId) => codex.cancelCodexAgent(conversationId),
    cancelAll: () => codex.cancelAllCodex(),
  },
  opencode: {
    start: (request, sink) => opencode.startOpenCodeAgent(request, sink),
    editResend: (request, sink) => opencode.startOpenCodeAgent({ ...request, resumeSessionId: request.resumeSessionId }, sink),
    cancel: (conversationId) => opencode.cancelOpenCodeAgent(conversationId),
    cancelAll: () => opencode.cancelAllOpenCode(),
  },
  multica: {
    start: (request, sink) => multica.startMulticaAgent(request, sink),
    // Multica has no native edit/fork; edits historically re-ran through Claude.
    editResend: claudeRuntime.editResend,
    cancel: (conversationId) => {
      multica.cancelMulticaAgent(conversationId).catch((err: unknown) => {
        console.error("[multica] cancel failed", { conversationId, error: errorMessage(err) });
      });
    },
    cancelAll: () => undefined,
  },
  // Ported from PR #230: Grok resumes its native session on edit; AGY re-runs.
  grok: {
    start: (request, sink) => grok.startGrokAgent(request, sink),
    editResend: (request, sink) => grok.startGrokAgent({ ...request, resumeSessionId: request.resumeSessionId }, sink),
    cancel: (conversationId) => grok.cancelGrokAgent(conversationId),
    cancelAll: () => grok.cancelAllGrok(),
  },
  agy: {
    start: (request, sink) => agy.startAgyAgent(request, sink),
    editResend: (request, sink) => agy.startAgyAgent(request, sink),
    cancel: (conversationId) => agy.cancelAgyAgent(conversationId),
    cancelAll: () => agy.cancelAllAgy(),
  },
};

const RUNTIME_IDS = Object.keys(AGENT_RUNTIMES) as RuntimeProviderId[];

/** `opts.runtimeProvider || opts.remoteRuntime?.provider || opts.provider`, defaulting to Claude. */
export function resolveRuntimeProvider(request: Partial<AgentStartRequest>): RuntimeProviderId {
  const candidate: unknown = request.runtimeProvider || request.remoteRuntime?.provider || request.provider;
  return RUNTIME_IDS.find((id) => id === candidate) ?? "claude";
}

export function cancelEverywhere(conversationId: string): void {
  for (const id of RUNTIME_IDS) {
    try {
      AGENT_RUNTIMES[id].cancel(conversationId);
    } catch (err) {
      console.error(`[agent] ${id} cancel failed:`, errorMessage(err));
    }
  }
}

export function cancelAllRuntimes(): void {
  for (const id of RUNTIME_IDS) {
    try {
      AGENT_RUNTIMES[id].cancelAll();
    } catch (err) {
      console.error(`[agent] ${id} cancelAll failed:`, errorMessage(err));
    }
  }
}
