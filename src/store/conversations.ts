/**
 * Conversations store — live per-conversation chat state (messages, stream
 * status, captured native session ids), replacing the `useState(Map)` that
 * used to live inside `useAgent()` at the App root.
 *
 * State: `{ byId: ReadonlyMap<conversationId, ConversationRuntime> }`.
 * Updates are copy-on-write: untouched conversations, messages and parts keep
 * their identity, so memoized consumers skip them.
 *
 * Reading (components): `useMessageIds`, `useMessage`, `useConversationStatus`,
 * `useStreamingIds`, `useConversation`. Reading (handlers): `getConversation`.
 * Writing: the action functions below (stable identity, call from anywhere).
 * IPC: `connectAgentEvents()` (ref-counted; `useAgent()` calls it).
 */
export { conversationsStore, getConversation, getLastCommitPriority, type CommitPriority } from "./chat/store";
export { EMPTY_CONVERSATION, type ConversationRuntime, type ConversationsState } from "./chat/types";
export {
  appendLocalMessages,
  applyStreamPayloads,
  cancelMessage,
  editAndResend,
  loadMessages,
  markMulticaConnected,
  prepareMessage,
  replaceMessages,
  startPreparedMessage,
  type ChatMessageInput,
  type EditAndResendInput,
  type PrepareMessageInput,
  type StartPreparedMessageInput,
} from "./chat/actions";
export { connectAgentEvents } from "./chat/agentBridge";
export {
  useConversation,
  useConversationStatus,
  useConversationsMap,
  useMessage,
  useMessageIds,
  useStreamingIds,
  type ConversationStatus,
} from "./chat/selectors";
