import type { AgentPermissionRequest, Attachment, ChatMessage, Conversation, PermissionBehavior, PermissionScope, QueuedMessage } from "@shared/chat/types";
import type { EffortLevel, ModelDefinition } from "@shared/models/types";
import type { ProjectMeta, Wallpaper } from "@shared/state/types";
import type { RuntimeSetupCardProps, RuntimeSetupState } from "../RuntimeSetupCard";
import type { NewChatRequest } from "../NewChatCard";
import type { TabStripTab } from "../sidebar/tabStrip";
import type { CanControlTarget, ControlChangeHandler, EditHandler } from "../message/types";

/** The active conversation as App hands it to ChatArea (sidebar row + live state). */
export interface ChatAreaConversation extends Partial<Omit<Conversation, "id" | "title" | "model">> {
  id: string;
  title: string;
  model: string;
  /** Live messages (from the conversations store). */
  msgs: readonly ChatMessage[];
  isStreaming?: boolean;
  error?: string | null;
}

export interface PermissionResponseInput {
  requestId: string;
  behavior: PermissionBehavior;
  scope?: PermissionScope;
}

/** Runtime-setup gate plus the card's actions (App merges them into one object). */
export interface ChatRuntimeSetup extends RuntimeSetupState {
  onRunCommand?: RuntimeSetupCardProps["onRunCommand"];
  onRefresh?: RuntimeSetupCardProps["onRefresh"];
  onConfigureOpenCode?: RuntimeSetupCardProps["onConfigureOpenCode"];
}

/** Send from the composer; a rejected promise restores the draft (PR #230). */
export type SendHandler = (text: string, attachments?: Attachment[]) => unknown;

export interface ChatAreaProps {
  convo: ChatAreaConversation | null;
  onSend: SendHandler;
  onCancel: () => void;
  onEdit?: EditHandler;
  sidebarOpen: boolean;
  onModelChange: (modelId: string) => void;
  defaultModel: string;
  /** Reasoning effort for the active (or new) conversation; null = model default. */
  effort?: EffortLevel | null;
  onEffortChange?: (effort: EffortLevel | null) => void;
  queuedMessages?: readonly QueuedMessage[];
  onUpdateQueuedMessage?: (queueId: string, text: string) => void;
  onRemoveQueuedMessage?: (queueId: string) => void;
  permissionRequests?: readonly AgentPermissionRequest[];
  onRespondPermission?: (response: PermissionResponseInput) => void;
  onToggleTerminal?: () => void;
  terminalOpen?: boolean;
  terminalCount?: number;
  wallpaper?: Wallpaper | null;
  cwd?: string | null;
  draftsPath?: string | null;
  onCwdChange?: (cwd: string) => void;
  onRefocusTerminal?: () => void;
  showNewChatCard?: boolean;
  onCreateChat: (request: NewChatRequest) => Promise<unknown> | void;
  onCancelNewChat?: () => void;
  allCwdRoots?: readonly string[];
  projects?: Readonly<Record<string, ProjectMeta>>;
  defaultPrBranch?: string | null;
  newChatDefaultCwd?: string | null;
  coauthorEnabled?: boolean;
  coauthorTrailer?: string;
  onControlChange?: ControlChangeHandler;
  canControlTarget?: CanControlTarget;
  developerMode?: boolean;
  tabs?: readonly TabStripTab[];
  activeTabId?: string | null;
  onSelectTab?: (id: string) => void;
  onCloseTab?: (id: string) => void;
  windowControlsVisible?: boolean;
  locale?: string;
  runtimeSetup?: ChatRuntimeSetup | null;
  extraModels?: readonly ModelDefinition[];
}
