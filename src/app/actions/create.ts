/** Creating conversations: drafts, the new-chat card, project rows, dispatch. */

import type { Conversation, DispatchRowResult } from "@shared/chat/types";
import type { EffortLevel } from "@shared/models/types";
import { isMulticaModelId, getMulticaAgentIdFromModelId } from "@shared/models/ids";
import { getAppSettings, setAppSetting } from "../../store/appSettings";
import { prependConvo, setActiveId } from "../../store/convoList";
import { loadMulticaState } from "../../multica/store";
import { getMainRepoRoot, getProjectRootOrUndefined, normalizeConversationCreationCwd } from "../conversation/paths";
import { createConversationSession, normalizeConversationState } from "../conversation/sessions";
import { errorMessage, getApi } from "../lib/api";
import { resolveModel } from "../stores/models";
import { getUi, patchUi } from "../stores/ui";
import type { CreateChatOptions, DispatchHandler, DispatchOutcome } from "../types";
import { sendMessageToConversation } from "./send";

export interface ConversationDraftInput {
  id: string;
  title: string;
  modelId: string;
  effort?: EffortLevel | null;
  ts: number;
  cwd: string | null | undefined;
  dispatchId?: string;
  tags?: string[];
}

export function newConversationId(): string {
  return `c${Date.now()}`;
}

/** A new, empty conversation seeded with a session for its model's provider. */
export function createConversationDraft({ id, title, modelId, effort, ts, cwd, dispatchId, tags }: ConversationDraftInput): Conversation {
  const provider = resolveModel(modelId).provider;
  const seedSession = createConversationSession({
    provider,
    nativeSessionId: null,
    model: modelId,
    syncedThroughMessageCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    origin: "draft",
  });
  return normalizeConversationState({
    id,
    title,
    model: modelId,
    ...(effort ? { effort } : {}),
    ts,
    // `cwd: null` marks a drafts conversation (persisted as such), but
    // `Conversation.cwd` is typed `string | undefined` in shared/chat/types.
    cwd: cwd as string | undefined,
    sessions: [seedSession],
    activeSessionId: seedSession.id,
    providerSessions: {},
    sessionId: null,
    sessionProvider: null,
    archivedMessages: [],
    dispatchId,
    tags,
  });
}

/** Effort chosen in the composer while no conversation was active (consumed once). */
export function takeNewChatEffort(): EffortLevel | null {
  const effort = getUi().newChatEffort;
  if (effort) patchUi({ newChatEffort: null });
  return effort;
}

/** Toolbar / Cmd-N "new chat": open the new-chat card with the contextual project. */
export function openNewChat(): void {
  patchUi({ showSettings: false, showNewChatCard: true, newChatProject: undefined });
}

/**
 * Project-row "new chat" (PR #230): the same card as the toolbar, preset to
 * that project (`null` = drafts). Creating the chat unhides the project.
 */
export function openNewChatInProject(cwdRoot: string | null | undefined): void {
  patchUi({ showSettings: false, showNewChatCard: true, newChatProject: cwdRoot ?? null });
}

export function cancelNewChat(): void {
  patchUi({ showNewChatCard: false, newChatProject: undefined });
}

function registerProjectForChat(projectRoot: string | null | undefined): void {
  if (!projectRoot) return;
  setAppSetting("projects", (prev) => {
    const existing = prev[projectRoot];
    if (!existing) return { ...prev, [projectRoot]: { name: projectRoot.split("/").pop(), manual: true } };
    if (existing.hidden) return { ...prev, [projectRoot]: { ...existing, hidden: false } };
    return prev;
  });
}

/** NewChatCard / dispatch: create (branch / worktree / Multica session), activate, send the prompt. */
export async function createChat(opts: CreateChatOptions): Promise<void> {
  const api = getApi();
  const { draftsPath } = getUi();
  const { cwd: appCwd, defaultModel } = getAppSettings();
  const id = opts.id || newConversationId();
  const effectiveCwd =
    opts.cwd !== undefined ? normalizeConversationCreationCwd(opts.cwd, draftsPath) : getProjectRootOrUndefined(appCwd, draftsPath);
  const modelId = opts.model || defaultModel;
  const draft = createConversationDraft({
    id,
    title: opts.title || opts.prompt?.slice(0, 50) || "New chat",
    modelId,
    effort: opts.effort !== undefined ? opts.effort : takeNewChatEffort(),
    ts: Date.now(),
    cwd: effectiveCwd,
    dispatchId: opts.dispatchId,
    tags: opts.tags,
  });
  let conversation: Conversation = draft;

  if (opts.worktree && !opts.branch) throw new Error("A worktree requires a branch name.");

  if (opts.branch && effectiveCwd && api) {
    if (opts.worktree) {
      const wtPath = `${effectiveCwd}/.worktrees/${opts.branch}`;
      await api.gitWorktreeAdd(effectiveCwd, wtPath, opts.branch, { createBranch: true, startPoint: opts.worktreeBaseBranch });
      conversation = { ...conversation, cwd: wtPath };
    } else if (opts.branchMode === "existing") {
      await api.gitCheckout(effectiveCwd, opts.branch);
    } else {
      await api.gitCreateBranch(effectiveCwd, opts.branch);
    }
  }

  if (isMulticaModelId(modelId)) {
    // Validate before any side-effects so a malformed id doesn't leave a
    // pushed-but-unused branch on origin.
    const agentId = getMulticaAgentIdFromModelId(modelId);
    if (!agentId) throw new Error(`Invalid Multica model id: ${modelId}`);
    if (!api) throw new Error("Multica is unavailable outside the desktop app");
    const mState = loadMulticaState();
    // Publish the branch so Multica's runtime can fetch.
    if (conversation.cwd && opts.branch) {
      try {
        await api.gitPush(conversation.cwd);
      } catch (err) {
        throw new Error(`Failed to publish branch '${opts.branch}': ${errorMessage(err)}`);
      }
    }
    const session = await api.multicaEnsureSession({
      serverUrl: mState.serverUrl,
      token: mState.token,
      workspaceId: mState.workspaceId,
      workspaceSlug: mState.workspaceSlug,
      agentId,
      title: opts.title || opts.prompt?.slice(0, 60) || "RayLine chat",
    });
    // Persisted on the conversation so resume works after restart.
    const context = {
      serverUrl: mState.serverUrl,
      workspaceSlug: mState.workspaceSlug,
      workspaceId: mState.workspaceId,
      agentId,
      sessionId: session.id,
    };
    conversation = { ...conversation, _multica: context, _multicaSessions: { [agentId]: context } };
  }

  prependConvo(conversation);
  if (!opts.suppressActivate) {
    setActiveId(id);
    patchUi({ showSettings: false, showNewChatCard: false, newChatProject: undefined });
  }
  registerProjectForChat(getMainRepoRoot(opts.cwd || effectiveCwd));

  const prompt = opts.issueContext ? `${opts.issueContext}\n\n${opts.prompt || ""}` : opts.prompt || "";
  if (prompt) {
    await sendMessageToConversation({ conversationId: id, conversation, text: prompt, attachments: opts.attachments });
  }
}

/** Dispatch card: one worktree conversation per row; activates the first success. */
export const dispatchRows: DispatchHandler = async (rows): Promise<DispatchOutcome> => {
  const dispatchId = `d${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const { defaultModel } = getAppSettings();
  const results = await Promise.all(
    rows.map((row): Promise<DispatchRowResult> => {
      const chatId = `c${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      return createChat({
        id: chatId,
        prompt: row.prompt,
        attachments: row.attachments,
        model: row.model || defaultModel,
        // Explicit (null = model default) so dispatch never consumes the new-chat effort.
        effort: row.effort ?? null,
        cwd: row.cwd,
        worktree: true,
        branch: row.branch,
        issueContext: row.issueContext,
        dispatchId,
        tags: ["dispatch", ...(row.tag ? [row.tag] : [])],
        suppressActivate: true,
      }).then(
        () => ({ ok: true, row, chatId }),
        (error: unknown) => ({ ok: false, row, chatId, error }),
      );
    }),
  );
  const firstSuccess = results.find((r) => r.ok);
  if (firstSuccess) {
    setActiveId(firstSuccess.chatId);
    patchUi({ showSettings: false, showNewChatCard: false });
  }
  return { dispatchId, results };
};
