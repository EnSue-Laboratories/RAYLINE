/**
 * Typed views of main-process modules owned by other work packages that are
 * still `// @ts-nocheck` CommonJS. Each module is imported once here and cast
 * to the interface it is expected to satisfy, so the rest of electron-shell
 * stays strictly typed.
 *
 * TODO(ts-boundary): drop each cast once the owning package converts the file
 * (electron-providers: agent / codex / opencode / multica managers and
 * provider-upstreams) and import the named exports directly.
 */

import * as untypedAgentManager from "../agent-manager";
import * as untypedCodexAgentManager from "../codex-agent-manager";
import * as untypedMulticaManager from "../multica-manager";
import * as untypedOpenCodeAgentManager from "../opencode-agent-manager";
import * as untypedProviderUpstreams from "../provider-upstreams";
import type { AgentEventSink } from "../agent-sink";
import type { InvokeHandler } from "@shared/ipc/contract";
import type { AgentPermissionResponse, AgentStartRequest } from "@shared/chat/types";
import type {
  MulticaSubscribeArgs,
  OpenCodeRuntimeConfig,
  ProviderUpstreamConfig,
  UpstreamProviderId,
} from "@shared/providers/types";

/**
 * Providers are moving from a WebContents parameter to `AgentEventSink`
 * (electron/agent-sink). Until electron-providers lands they still call
 * `send(channel, payload)` / `isDestroyed()`, so main passes a sink that
 * supports both shapes (see ipc/agent.ts).
 */
export type ProviderSink = AgentEventSink;

/** May return a promise; launch failures surface through rejection or a throw. */
type Launch<A> = (request: A, sink: ProviderSink) => unknown;

export interface AgentManagerModule {
  startAgent: Launch<AgentStartRequest>;
  cancelAgent: (conversationId: string) => void;
  cancelAll: () => void;
  rewindFiles: InvokeHandler<"rewind-files">;
  respondPermission: (response: AgentPermissionResponse) => void;
}

export interface CodexAgentManagerModule {
  startCodexAgent: Launch<AgentStartRequest>;
  cancelCodexAgent: (conversationId: string) => void;
  cancelAllCodex: () => void;
}

export interface OpenCodeRuntimeEnv {
  env: NodeJS.ProcessEnv;
  cleanup: () => void;
}

export interface OpenCodeAgentManagerModule {
  startOpenCodeAgent: Launch<AgentStartRequest>;
  cancelOpenCodeAgent: (conversationId: string) => void;
  cancelAllOpenCode: () => void;
  createOpenCodeRuntimeEnv: (config: OpenCodeRuntimeConfig | undefined, model: string) => OpenCodeRuntimeEnv;
  shouldEnableThinking: (model: string, thinking: boolean | undefined) => boolean;
}

export interface MulticaManagerModule {
  startMulticaAgent: (request: AgentStartRequest, sink: ProviderSink) => Promise<unknown>;
  cancelMulticaAgent: (conversationId: string) => Promise<unknown>;
  subscribeMulticaAgent: (request: MulticaSubscribeArgs, sink: ProviderSink) => Promise<void> | void;
  multicaSendCode: InvokeHandler<"multica-send-code">;
  multicaVerifyCode: InvokeHandler<"multica-verify-code">;
  multicaListWorkspaces: InvokeHandler<"multica-list-workspaces">;
  multicaListAgents: InvokeHandler<"multica-list-agents">;
  multicaEnsureSession: InvokeHandler<"multica-ensure-session">;
  multicaSendMessage: InvokeHandler<"multica-send-message">;
  multicaListMessages: InvokeHandler<"multica-list-messages">;
}





export interface ProviderUpstreamsModule {
  normalizeProviderUpstreamConfig: (config: unknown, provider: UpstreamProviderId) => ProviderUpstreamConfig | null;
  patchClaudeSettingsWin32: (upstream: { baseURL: string; apiKey: string }, model: string) => void;
  patchClaudeConfigWin32: () => void;
}

// TODO(ts-boundary): electron-providers
export const agentManager = untypedAgentManager as unknown as AgentManagerModule;
// TODO(ts-boundary): electron-providers
export const codexAgentManager = untypedCodexAgentManager as unknown as CodexAgentManagerModule;
// TODO(ts-boundary): electron-providers
export const openCodeAgentManager = untypedOpenCodeAgentManager as unknown as OpenCodeAgentManagerModule;
// TODO(ts-boundary): electron-providers
export const multicaManager = untypedMulticaManager as unknown as MulticaManagerModule;
// TODO(ts-boundary): electron-providers
export const providerUpstreams = untypedProviderUpstreams as unknown as ProviderUpstreamsModule;
