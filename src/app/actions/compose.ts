/** Composer submit: slash commands, `!shell` mode, queueing while busy, auto-create. */

import type { Attachment, Conversation } from "@shared/chat/types";
import { getAppSettings } from "../../store/appSettings";
import { getActiveConvo, getActiveId, prependConvo, setActiveId, updateConvo } from "../../store/convoList";
import { ensureTranscriptLoaded } from "../../store/persistence";
import { getEffectiveConversationCwd, getProjectRootOrUndefined } from "../conversation/paths";
import { getActiveConversationSession, normalizeConversationState, upsertConversationSession } from "../conversation/sessions";
import { deriveConversationTitle } from "../conversation/titles";
import { formatShellResult, runShellCommand } from "../shell/shellCommand";
import { appendLocalMessages, getConversation } from "../../store/conversations";
import { resolveModel } from "../stores/models";
import { enqueueMessage, sendInFlight } from "../stores/queue";
import { getUi, patchUi } from "../stores/ui";
import { createConversationDraft, newConversationId, openNewChat, takeNewChatEffort } from "./create";
import { sendMessageToConversation } from "./send";

/** Handle client-side slash commands; true when the input was consumed. */
function handleSlashCommand(trimmed: string): boolean {
  if (!trimmed.startsWith("/") || trimmed.includes(" ")) return false;
  const cmd = trimmed.toLowerCase();
  if (cmd === "/clear" || cmd === "/new") {
    openNewChat();
    return true;
  }
  // /model is a no-op (the picker is in the top bar); bare "/" is never sent.
  if (cmd === "/model" || cmd.length <= 1) return true;
  // /compact and others go to the agent as regular text.
  return false;
}

async function runShellInConversation(convoId: string, convo: Conversation, trimmed: string): Promise<void> {
  await ensureTranscriptLoaded(convoId);
  const command = trimmed.slice(1).trim();
  const { cwd: appCwd } = getAppSettings();
  const effectiveCwd = getEffectiveConversationCwd(convo, appCwd, getUi().draftsPath);
  const normalized = normalizeConversationState(convo);
  const activeSession = getActiveConversationSession(normalized);
  const currentProvider = resolveModel(normalized.model).provider;
  const currentMessageCount = getConversation(convoId).messages.length;

  if (currentMessageCount === 0) updateConvo(convoId, (c) => ({ ...c, title: trimmed.slice(0, 50) }));
  appendLocalMessages(convoId, [{ role: "user", text: command, mode: "shell-command", localOnly: true }]);

  const result = await runShellCommand(command, effectiveCwd);

  updateConvo(convoId, (c) =>
    upsertConversationSession(
      normalizeConversationState(c),
      {
        id: activeSession?.provider === currentProvider && !activeSession.nativeSessionId ? activeSession.id : undefined,
        provider: currentProvider,
        nativeSessionId: null,
        model: normalized.model,
        syncedThroughMessageCount: currentMessageCount + 2,
        origin: "local-shell",
      },
      { activate: true, preferPendingActive: true },
    ),
  );
  appendLocalMessages(convoId, [
    {
      role: "system",
      text: formatShellResult(result),
      mode: "shell-result",
      command,
      exitCode: result.exitCode ?? null,
      localOnly: true,
    },
  ]);
}

/** ChatComposer `onSend`. */
export async function sendFromComposer(text: string, attachments?: Attachment[]): Promise<void> {
  const trimmed = text.trim();
  const isShellCommand = trimmed.startsWith("!") && trimmed.length > 1;
  if (trimmed === "!") return;
  if (handleSlashCommand(trimmed)) return;

  const active = getActiveId();
  if (active && (getConversation(active).isStreaming || sendInFlight.has(active))) {
    enqueueMessage({ conversationId: active, text, attachments });
    return;
  }

  let convo = getActiveConvo();
  let convoId = active;
  if (!convo || !convoId) {
    const { cwd: appCwd, defaultModel } = getAppSettings();
    convoId = newConversationId();
    convo = createConversationDraft({
      id: convoId,
      title: deriveConversationTitle(text, attachments),
      modelId: defaultModel,
      effort: takeNewChatEffort(defaultModel),
      ts: Date.now(),
      cwd: getProjectRootOrUndefined(appCwd, getUi().draftsPath),
    });
    prependConvo(convo);
    setActiveId(convoId);
    patchUi({ showSettings: false });
  }

  if (isShellCommand) {
    await runShellInConversation(convoId, convo, trimmed);
    return;
  }
  await sendMessageToConversation({ conversationId: convoId, conversation: convo, text, attachments, titleText: text });
}
