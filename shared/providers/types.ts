/**
 * Provider / runtime domain types shared by the renderer and the main process.
 *
 * Terminology:
 *  - "runtime provider": which agent backend actually runs a turn
 *    (`claude`, `codex`, `opencode`, `multica`, `grok`, `agy`). This is what
 *    `agent-start` dispatches on (`opts.runtimeProvider || opts.provider`).
 *  - "model provider": the `provider` field on a model definition. Adds the
 *    `remote-*` variants used for SSH-hosted Claude/Codex models.
 */

/**
 * Agent backends the main process knows how to launch.
 *  - `grok`: xAI Grok Build CLI (`grok --output-format streaming-json`).
 *  - `agy`:  Google Antigravity CLI (`agy --print --output-format stream-json`).
 */
export type RuntimeProviderId = "claude" | "codex" | "opencode" | "multica" | "grok" | "agy";

/** Model-picker providers for SSH-hosted Claude / Codex. */
export type RemoteModelProviderId = "remote-claude" | "remote-codex";

/** Value of `ModelDefinition.provider`. */
export type ModelProviderId = RuntimeProviderId | RemoteModelProviderId;

/** Providers whose CLI can be pointed at a custom upstream (base URL / key). */
export type UpstreamProviderId = "claude" | "codex";

/** Providers that can run over an SSH remote runtime. */
export type RemoteRuntimeProviderId = "claude" | "codex";

export const RUNTIME_PROVIDER_IDS: readonly RuntimeProviderId[] = ["claude", "codex", "opencode", "multica", "grok", "agy"];

export const REMOTE_PROVIDER_BY_PROVIDER: Readonly<Record<RemoteModelProviderId, RemoteRuntimeProviderId>> = {
  "remote-claude": "claude",
  "remote-codex": "codex",
};

export function isRuntimeProviderId(value: unknown): value is RuntimeProviderId {
  return typeof value === "string" && (RUNTIME_PROVIDER_IDS as readonly string[]).includes(value);
}

export function isRemoteModelProviderId(value: unknown): value is RemoteModelProviderId {
  return value === "remote-claude" || value === "remote-codex";
}

export function isModelProviderId(value: unknown): value is ModelProviderId {
  return isRuntimeProviderId(value) || isRemoteModelProviderId(value);
}

/** Maps `remote-claude` → `claude` etc.; runtime providers map to themselves. */
export function getRuntimeProviderForProvider(provider: ModelProviderId): RuntimeProviderId {
  return isRemoteModelProviderId(provider) ? REMOTE_PROVIDER_BY_PROVIDER[provider] : provider;
}

// ── Provider upstreams (custom base URL / API key per CLI) ──────────────────

/**
 * Active upstream config sent to the main process with `agent-start` and
 * `sync-provider-upstreams` (output of `getProviderUpstreamConfig()` in
 * src/providerUpstreams/store, normalized by electron/provider-upstreams).
 */
export interface ProviderUpstreamConfig {
  provider: UpstreamProviderId;
  baseURL: string;
  apiKey: string;
  modelList: string[];
}

/** Persisted (localStorage `rayline.providerUpstreams.v1`) per-provider settings. */
export interface ProviderUpstreamSettings {
  enabled: boolean;
  baseURL: string;
  apiKey: string;
  /** Newline / comma separated model ids. */
  modelListText: string;
}

export interface ProviderUpstreamsState {
  providers: Record<UpstreamProviderId, ProviderUpstreamSettings>;
}

// ── CLI install probe ───────────────────────────────────────────────────────

/** Result of `check-cli-installed`. */
export interface CliInstalledSnapshot {
  claude: boolean;
  codex: boolean;
  opencode: boolean;
  /** `grok` resolvable (`GROK_BIN` or PATH). */
  grok: boolean;
  /** `agy` resolvable (`AGY_BIN` or PATH). */
  agy: boolean;
  /**
   * Optional `--version` output per CLI (semver, no "v"). Not populated by
   * main yet; when present the model picker gates models on
   * `ModelDefinition.minCliVersion`, otherwise it only shows a hint.
   */
  versions?: Partial<Record<"claude" | "codex" | "opencode" | "grok" | "agy", string>>;
}

export interface CheckCliInstalledOptions {
  /** Bypass the 5s main-process cache. */
  force?: boolean;
}

// ── OpenCode ────────────────────────────────────────────────────────────────

/** `getOpenCodeStatusSync()` in main; returned by `opencode-save-config`. */
export interface OpenCodeStatusSnapshot {
  installed: boolean;
  configured: boolean;
  binPath: string;
  configPath: string;
  configExists: boolean;
  authPath: string;
  authExists: boolean;
  /** `model` from ~/.config/opencode/opencode.json ("provider/model"), or "". */
  model: string;
  smallModel: string;
  providers: string[];
}

/** Result of `opencode-status`. */
export interface OpenCodeStatus extends OpenCodeStatusSnapshot {
  /** First line of `opencode --version`, or "". */
  version: string;
  /** Providers listed by `opencode models` ∪ configured providers, sorted. */
  supportedProviders: string[];
}

/** Argument of `opencode-save-config`. Validated/normalized in main. */
export interface OpenCodeSaveConfigInput {
  providerId: string;
  modelId: string;
  apiKey?: string;
  baseURL?: string;
  /** Defaults to true: also sets `model` in opencode.json. */
  setDefault?: boolean;
}

/** Result of `opencode-get-provider-config`. */
export interface OpenCodeProviderConfig {
  apiKey: string;
  baseURL: string;
}

/** Per-run OpenCode credentials sent with `agent-start` (`openCodeConfig`). */
export interface OpenCodeRuntimeConfig {
  providerId: string;
  modelId: string;
  apiKey: string;
  baseURL: string;
}

/** Persisted (localStorage `rayline.opencode.v1`) model entry. */
export interface OpenCodeModelEntry {
  /** `${providerId}/${modelId}` */
  id: string;
  providerId: string;
  modelId: string;
  label: string;
  apiKey: string;
  baseURL: string;
  enabled: boolean;
  thinking: boolean;
  addedAt: number;
  updatedAt: number;
}

export interface OpenCodeState {
  models: OpenCodeModelEntry[];
}

// ── Remote (SSH) runtime ────────────────────────────────────────────────────

/** `remoteRuntime` sent with `agent-start` for SSH-hosted models. */
export interface RemoteRuntimeConfig {
  type: "ssh";
  /** Full `ssh ...` command line (≤ 2000 chars, must start with `ssh`). */
  sshCommand: string;
  provider?: RemoteRuntimeProviderId;
  /** Absolute path of the CLI on the remote host, or "" to use PATH. */
  commandPath?: string;
  /** Remote working directory. */
  cwd?: string;
}

/** Output of `normalizeRemoteRuntime()` in electron/remote-runtime. */
export interface NormalizedRemoteRuntime {
  type: "ssh";
  sshCommand: string;
  provider: RemoteRuntimeProviderId | "";
  cwd: string;
  commandPath: string;
}

/** Persisted SSH probe state (`remoteSshRuntime` in app state). */
export interface RemoteSshRuntimeState {
  sshCommand: string;
  connected: boolean;
  claude: boolean;
  codex: boolean;
  claudePath: string;
  codexPath: string;
  /** epoch ms, 0 = never checked */
  checkedAt: number;
}

export interface RemoteRuntimeCheckInput {
  sshCommand: string;
}

/** `remote-runtime-check` result when the command could not even be launched. */
export interface RemoteRuntimeCheckFailure {
  ok: false;
  error: string;
  stdout?: string;
  stderr?: string;
  timedOut?: boolean;
}

/** `remote-runtime-check` result after the probe script ran (or timed out). */
export interface RemoteRuntimeProbeResult {
  ok: boolean;
  connected: boolean;
  claude: boolean;
  codex: boolean;
  claudePath: string;
  codexPath: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  /** Set when `timedOut`. */
  error?: string;
}

/** Discriminate with `"connected" in result`. */
export type RemoteRuntimeCheckResult = RemoteRuntimeCheckFailure | RemoteRuntimeProbeResult;

// ── Multica ─────────────────────────────────────────────────────────────────
// Multica is a remote agent server; REST payloads come from that server and
// are only loosely specified. Known fields are typed; callers should treat
// anything else as untrusted.

/** Per-conversation binding to a Multica chat session (`conversation._multica`). */
export interface MulticaContext {
  serverUrl: string;
  workspaceId: string;
  workspaceSlug: string;
  agentId: string;
  sessionId: string;
}

export interface MulticaAgent {
  id: string;
  name: string;
  runtime_id?: string;
  status?: string;
}

export interface MulticaWorkspace {
  id: string;
  slug: string;
  name?: string;
}

export interface MulticaUser {
  id: string;
  email?: string;
  name?: string;
}

export interface MulticaChatSession {
  id: string;
  agent_id?: string;
  title?: string;
}

export interface MulticaChatMessage {
  id: string | number;
  role: string;
  /** Usually a string; may be structured. */
  content: unknown;
}

/** Persisted (localStorage `multica.v1`) setup state. */
export interface MulticaStoreState {
  serverUrl: string;
  email: string;
  /** JWT, 30-day TTL. */
  token: string;
  tokenIssuedAt: number;
  workspaceId: string;
  workspaceSlug: string;
  agentsCache: MulticaAgent[];
  agentsCachedAt: number;
}

export interface MulticaServerArgs {
  serverUrl: string;
}

export interface MulticaAuthedArgs extends MulticaServerArgs {
  token: string;
}

export interface MulticaWorkspaceArgs extends MulticaAuthedArgs {
  workspaceId?: string;
  workspaceSlug?: string;
}

export interface MulticaSendCodeArgs extends MulticaServerArgs {
  email: string;
}

export interface MulticaVerifyCodeArgs extends MulticaServerArgs {
  email: string;
  code: string;
}

export interface MulticaVerifyCodeResult {
  token: string;
  user?: MulticaUser;
}

export interface MulticaEnsureSessionArgs extends MulticaWorkspaceArgs {
  agentId: string;
  title?: string;
}

export interface MulticaSessionArgs extends MulticaWorkspaceArgs {
  sessionId: string;
}

export interface MulticaSendMessageArgs extends MulticaSessionArgs {
  content: string;
}

export interface MulticaSendMessageResult {
  task_id?: string;
}

/** The server has returned both a bare array and `{ workspaces }`. */
export type MulticaListWorkspacesResult = MulticaWorkspace[] | { workspaces?: MulticaWorkspace[] };

/** The server has returned a bare array, `{ messages }` and `{ data }`. */
export type MulticaListMessagesResult =
  | MulticaChatMessage[]
  | { messages?: MulticaChatMessage[]; data?: MulticaChatMessage[] };

export interface MulticaSubscribeArgs {
  conversationId: string;
  _multica: MulticaContext;
  token: string;
}
