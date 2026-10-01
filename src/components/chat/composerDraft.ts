/** Composer draft persistence (PR #230) over the shared composerDrafts store. */
import type { Attachment } from "@shared/chat/types";
import { isAttachment } from "../../utils/attachments";
import { clearDraft, readDraft, writeDraft } from "../../utils/composerDrafts";

const PENDING_SCOPE_PREFIX = "pending:workspace";

/** One draft per conversation; before a conversation exists, one per workspace. */
export function composerDraftScope(conversationId: string | null | undefined, workspace: string | null | undefined): string {
  return conversationId ? `conversation:${conversationId}` : `${PENDING_SCOPE_PREFIX}:${workspace || "default"}`;
}

export interface ComposerDraftValue {
  text: string;
  attachments: Attachment[];
}

export function readComposerDraft(scope: string): ComposerDraftValue {
  const draft = readDraft(scope);
  return {
    text: typeof draft.text === "string" ? draft.text : "",
    attachments: Array.isArray(draft.attachments) ? draft.attachments.filter(isAttachment) : [],
  };
}

export function writeComposerDraft(scope: string, text: string, attachments: readonly Attachment[]): void {
  writeDraft(scope, text || attachments.length > 0 ? { text, attachments } : {});
}

export function clearComposerDraft(scope: string): void {
  clearDraft(scope);
}

/** Composer slash commands (labels come from i18n). */
export const SLASH_COMMANDS = ["/clear", "/new", "/compact"] as const;

/** `/cmd` prefix typed without a space yet → matching commands. */
export function matchSlashCommands(input: string): readonly string[] {
  if (!input.startsWith("/") || input.includes(" ")) return [];
  const lower = input.toLowerCase();
  return SLASH_COMMANDS.filter((command) => command.startsWith(lower));
}
