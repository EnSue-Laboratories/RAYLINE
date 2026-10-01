/**
 * Agent backends by runtime provider id. `agent-start` / `agent-edit-resend`
 * dispatch here, `agent-cancel` and app quit fan out to every backend.
 *
 * The Record is exhaustive over RuntimeProviderId, so adding a provider to
 * shared/providers/types fails to compile until it is wired here.
 */

import type { AgentEditResendRequest, AgentStartRequest } from "@shared/chat/types";
import type { RuntimeProviderId } from "@shared/providers/types";
import { errorMessage } from "../services/errors";
import {
  agentManager,
  codexAgentManager,
  multicaManager,
  openCodeAgentManager,
  type ProviderSink,
} from "./boundaries";

export interface AgentRuntime {
  /** May throw or return a rejecting promise; callers report launch failures. */
  readonly start: (request: AgentStartRequest, sink: ProviderSink) => unknown;
  /** Resume + fork the native session with an edited prompt. */
  readonly editResend: (request: AgentEditResendRequest, sink: ProviderSink) => unknown;
  readonly cancel: (conversationId: string) => void;
  /** On app quit. */
  readonly cancelAll: () => void;
}

function unavailableRuntime(label: string): AgentRuntime {
  // TODO(integration): electron-providers adds grok-agent-manager / agy-agent-manager
  // (startGrokAgent / cancelGrokAgent / cancelAllGrok, startAgyAgent / …).
  // Replace this stub with them; until then runs fail with a clear error.
  const fail = (): never => {
    throw new Error(`${label} runtime is not available in this build.`);
  };
  return { start: fail, editResend: fail, cancel: () => undefined, cancelAll: () => undefined };
}

const claudeRuntime: AgentRuntime = {
  start: (request, sink) => agentManager.startAgent(request, sink),
  editResend: (request, sink) => agentManager.startAgent({ ...request, forkSession: true }, sink),
  cancel: (conversationId) => agentManager.cancelAgent(conversationId),
  cancelAll: () => agentManager.cancelAll(),
};

export const AGENT_RUNTIMES: Readonly<Record<RuntimeProviderId, AgentRuntime>> = {
  claude: claudeRuntime,
  codex: {
    start: (request, sink) => codexAgentManager.startCodexAgent(request, sink),
    editResend: (request, sink) => codexAgentManager.startCodexAgent({ ...request, resumeSessionId: request.resumeSessionId }, sink),
    cancel: (conversationId) => codexAgentManager.cancelCodexAgent(conversationId),
    cancelAll: () => codexAgentManager.cancelAllCodex(),
  },
  opencode: {
    start: (request, sink) => openCodeAgentManager.startOpenCodeAgent(request, sink),
    editResend: (request, sink) => openCodeAgentManager.startOpenCodeAgent({ ...request, resumeSessionId: request.resumeSessionId }, sink),
    cancel: (conversationId) => openCodeAgentManager.cancelOpenCodeAgent(conversationId),
    cancelAll: () => openCodeAgentManager.cancelAllOpenCode(),
  },
  multica: {
    start: (request, sink) => multicaManager.startMulticaAgent(request, sink),
    // Multica has no native edit/fork; edits historically re-ran through Claude.
    editResend: claudeRuntime.editResend,
    cancel: (conversationId) => {
      multicaManager.cancelMulticaAgent(conversationId).catch((err: unknown) => {
        console.error("[multica] cancel failed", { conversationId, error: errorMessage(err) });
      });
    },
    cancelAll: () => undefined,
  },
  grok: unavailableRuntime("Grok"),
  agy: unavailableRuntime("Antigravity"),
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
