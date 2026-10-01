/** Pure normalization of persisted conversations on load. */

import type { Conversation } from "@shared/chat/types";
import type { ConversationMeta } from "@shared/state/types";
import { normalizeModelSelection } from "@shared/models/registry";
import { resetPinnedTabs } from "../../utils/tabs";
import { hasConversationMessages, normalizeConversationState } from "../conversation/sessions";

/**
 * Normalize persisted conversations: legacy model ids keep their encoded
 * effort (`gpt55-high` → `gpt-5.5` + effort "high") and Grok `--continue`
 * (`grok-46-continue` → `grok-4.6` + grokContinue), the session ledger is
 * migrated, and pinned tabs that can no longer be streaming get a run-ended
 * stamp. `withTranscripts` = the input carries `archivedMessages` (legacy
 * load); v2 index rows are metadata only and are all kept.
 */
export function restoreConversations(
  raw: readonly (Conversation | ConversationMeta)[],
  { withTranscripts, now = Date.now() }: { withTranscripts: boolean; now?: number },
): Conversation[] {
  const restored = raw
    .filter((convo): convo is Conversation | ConversationMeta => Boolean(convo) && typeof convo.id === "string")
    .map((convo) => {
      const { effort: rawEffort, ...rest } = convo;
      const selection = normalizeModelSelection(convo.model, rawEffort);
      const archived = "archivedMessages" in convo && Array.isArray(convo.archivedMessages) ? convo.archivedMessages : [];
      return normalizeConversationState({
        ...rest,
        model: selection.id,
        ...(selection.effort ? { effort: selection.effort } : {}),
        ...(selection.grokContinue || convo.grokContinue ? { grokContinue: true } : {}),
        lastProvider: convo.lastProvider || convo.provider || undefined,
        sessionProvider: convo.sessionProvider || null,
        archivedMessages: archived,
      });
    })
    .filter((conversation) => !withTranscripts || hasConversationMessages(conversation));

  return resetPinnedTabs(
    restored.map((c) => {
      if (!c.tab?.pinned) return c;
      // A persisted tab can't be mid-stream after relaunch: show it as "done" (unread).
      if (c.tab.runEndedAt == null) return { ...c, tab: { ...c.tab, runEndedAt: now } };
      return c;
    }),
  );
}

export function pickRestoredActive(convos: readonly Conversation[], active: string | null | undefined): string | null {
  return convos.some((c) => c.id === active) ? active ?? null : convos[0]?.id ?? null;
}
