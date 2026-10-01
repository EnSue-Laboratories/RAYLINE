/**
 * Types shared by the app shell (src/app). Domain types come from shared/;
 * these describe the renderer-side seams between App's hooks, stores and
 * the still-unconverted components.
 */

import type { AgentPermissionRequest, Attachment, DispatchRowInput, DispatchRowResult } from "@shared/chat/types";
import type { EffortLevel } from "@shared/models/types";

// Live chat state and its actions: src/store/conversations (chat-core).

// ── useTerminal (terminal-pm-ui) ────────────────────────────────────────────

export type { TerminalApi } from "../hooks/useTerminal";

// ── Chat creation / dispatch ────────────────────────────────────────────────

/** `onCreateChat` options (NewChatCard, dispatch rows). */
export interface CreateChatOptions {
  id?: string;
  title?: string;
  prompt?: string;
  attachments?: Attachment[];
  model?: string;
  effort?: EffortLevel | null;
  /** undefined = app default, null = drafts. */
  cwd?: string | null;
  branch?: string;
  branchMode?: "new" | "existing";
  worktree?: boolean;
  worktreeBaseBranch?: string;
  issueContext?: string;
  dispatchId?: string;
  tags?: string[];
  suppressActivate?: boolean;
}

export interface DispatchOutcome {
  dispatchId: string;
  results: DispatchRowResult[];
}

export type DispatchHandler = (rows: DispatchRowInput[]) => Promise<DispatchOutcome>;

// ── Permissions ─────────────────────────────────────────────────────────────

export type PermissionRequest = AgentPermissionRequest;

export interface PermissionReply {
  requestId: string;
  behavior: "allow" | "deny";
  scope?: "once" | "session";
  message?: string;
}

// ── Runtime setup card ──────────────────────────────────────────────────────

export interface RuntimeSetupCommand {
  providerId: string;
  command: string;
}

export interface RuntimeSetupInfo {
  required: boolean;
  checking: boolean;
  installed: { claude: boolean; codex: boolean; opencode: boolean; grok: boolean; agy: boolean };
  opencodeConfigured: boolean;
  platform: string;
  onRunCommand: (command: RuntimeSetupCommand) => Promise<void>;
  onRefresh: () => void;
  onConfigureOpenCode: () => void;
}

// ── Lab / value controls (ValueControlBlock) ────────────────────────────────

export interface ControlChange {
  target: string;
  value: unknown;
}
