/**
 * Typed prop view of ChatArea, which is still `// @ts-nocheck`. Its inferred
 * prop types are `any` (or `never[]` for `= []` defaults), so it is cast once
 * here to the props App passes — including the new `effort` /
 * `onEffortChange` pair chat-core adds in parallel.
 *
 * TODO(ts-boundary): delete once chat-core lands ChatArea.
 */

import type { ComponentType } from "react";
import type { Conversation, QueuedMessage } from "@shared/chat/types";
import type { EffortLevel, RemoteModelDefinition } from "@shared/models/types";
import type { Locale, Wallpaper } from "@shared/state/types";
import type { ChooserProjects } from "./conversation/paths";
import type { TabDescriptor } from "./derived/tabs";
import type {
  ControlChange,
  CreateChatOptions,
  PermissionReply,
  PermissionRequest,
  RuntimeSetupInfo,
} from "./types";
import ChatAreaUntyped from "../components/ChatArea";

/** `convo` prop of ChatArea: the active row plus its live transcript. */
export type ChatAreaConversation = Conversation & {
  msgs: Conversation["archivedMessages"];
  isStreaming: boolean;
  error: string | null;
};

export interface ChatAreaProps {
  convo: ChatAreaConversation | null;
  onSend: (text: string, attachments?: CreateChatOptions["attachments"]) => Promise<void>;
  onCancel: () => void;
  onEdit: (messageIndex: number, newText: string) => Promise<void>;
  sidebarOpen: boolean;
  onModelChange: (modelId: string) => void;
  defaultModel: string;
  /** Per-conversation reasoning effort (null = model default). */
  effort: EffortLevel | null;
  onEffortChange: (effort: EffortLevel | null) => void;
  queuedMessages: QueuedMessage[];
  onUpdateQueuedMessage: (queueId: string, text: string) => void;
  onRemoveQueuedMessage: (queueId: string) => void;
  permissionRequests: PermissionRequest[];
  onRespondPermission: (reply: PermissionReply) => void;
  onToggleTerminal: () => Promise<void>;
  terminalOpen: boolean;
  terminalCount: number;
  tabs: TabDescriptor[];
  activeTabId: string | null;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  wallpaper: Wallpaper | null;
  cwd: string | undefined;
  draftsPath: string | null;
  onRefocusTerminal: () => void;
  onCwdChange: (cwd: string) => void;
  showNewChatCard: boolean;
  onCreateChat: (opts: CreateChatOptions) => Promise<void>;
  onCancelNewChat: () => void;
  allCwdRoots: string[];
  projects: ChooserProjects;
  defaultPrBranch: string;
  newChatDefaultCwd: string | null;
  coauthorEnabled: boolean;
  coauthorTrailer: string;
  onControlChange: (change: ControlChange) => void;
  canControlTarget: (target: string) => boolean;
  developerMode: boolean;
  windowControlsVisible: boolean;
  locale: Locale;
  runtimeSetup: RuntimeSetupInfo;
  extraModels: RemoteModelDefinition[];
}

export const ChatArea = ChatAreaUntyped as unknown as ComponentType<ChatAreaProps>;
