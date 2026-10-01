import type { MouseEvent } from "react";
import type { Conversation, ConversationSession } from "@shared/chat/types";
import type { ModelDefinition } from "@shared/models";
import type { ProjectMeta } from "@shared/state/types";

export type { FontScale } from "../../contexts/FontSizeContext";
export type { Translator } from "../../i18n";

/**
 * The slice of a conversation row the sidebar reads. App passes richer rows
 * (full `Conversation` plus row-cache bookkeeping); anything structurally
 * compatible works. Drafts carry `cwd: null`.
 */
export interface SidebarConversation
  extends Pick<Conversation, "id" | "title" | "model" | "ts">,
    Partial<Pick<Conversation, "lastPreview" | "tags" | "sessionId" | "archivedMessages" | "_searchPreview">> {
  cwd?: string | null;
  sessions?: readonly Pick<ConversationSession, "nativeSessionId">[];
  /** Live stream flag merged in by App's sidebar row cache. */
  isStreaming?: boolean;
  /** Last-activity stamp when the row provides one; falls back to `ts`. */
  updatedAt?: number;
}

/** `state.projects`, keyed by main repo root. */
export type ProjectsMeta = Readonly<Record<string, ProjectMeta>>;

export interface ProjectGroupData {
  cwdRoot: string;
  name: string;
  collapsed: boolean;
  hidden: boolean;
  context: string;
  convos: readonly SidebarConversation[];
  /** Newest conversation `ts`; null for an empty (manually added) project. */
  latestTs: number | null;
}

/** Extra (Multica / OpenCode / upstream) models used to resolve row tags. */
export type ExtraModels = readonly ModelDefinition[];

export type SelectConversation = (id: string) => void;
export type DeleteConversation = (id: string, event: MouseEvent) => void;
