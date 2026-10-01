import type { AssistantMessage, ChatMessage, MessagePart, StreamState, UserMessage } from "@shared/chat/types";
import type { ConversationRuntime, StreamEffect } from "./types";

type ConversationFields = Omit<ConversationRuntime, "messages">;

export function createStreamState(): StreamState {
  return { currentTurn: 0, seenIndexes: {}, activeBlocks: {}, activeThinking: {} };
}

/**
 * Copy-on-write view of ONE conversation for the duration of a flush.
 *
 * The first write copies the conversation object, the first message write
 * copies the messages array, and each message / parts array / part / stream
 * state is copied at most once (tracked in `owned`). Everything that is never
 * written keeps its identity, so `memo` on untouched messages and parts holds.
 *
 * A draft must not outlive its flush: once committed, its objects are part of
 * the immutable store state.
 */
export class ConversationDraft {
  private current: ConversationRuntime;
  private convoOwned: boolean;
  private messagesOwned: boolean;
  private touched = false;
  private readonly owned = new WeakSet<object>();

  constructor(
    readonly id: string,
    private readonly base: ConversationRuntime | undefined,
    readonly effects: StreamEffect[] = [],
    fallback: () => ConversationRuntime = () => ({ messages: [], isStreaming: true, error: null }),
  ) {
    this.current = base ?? fallback();
    this.convoOwned = base === undefined;
    this.messagesOwned = base === undefined;
  }

  /** Current (possibly drafted) conversation. Treat as read-only. */
  get conversation(): Readonly<ConversationRuntime> {
    return this.current;
  }

  get messages(): readonly ChatMessage[] {
    return this.current.messages;
  }

  /** True when the conversation exists before or after this draft. */
  get exists(): boolean {
    return this.base !== undefined || this.touched;
  }

  /** Whether committing this draft changes the store. */
  get changed(): boolean {
    return this.base === undefined ? this.touched : this.current !== this.base;
  }

  /** The value to commit, or undefined when the conversation should stay absent. */
  result(): ConversationRuntime | undefined {
    return this.exists ? this.current : undefined;
  }

  /** Ensure the conversation exists after commit even if nothing else changes. */
  touch(): void {
    this.touched = true;
  }

  log(message: string, data: Record<string, unknown>): void {
    this.effects.push({ kind: "log", message, data });
  }

  set<K extends keyof ConversationFields>(key: K, value: ConversationRuntime[K]): void {
    this.touched = true;
    if (Object.is(this.current[key], value)) return;
    this.ensureConvo()[key] = value;
  }

  /** Replace the whole conversation entry (drops every field not in `value`). */
  replace(value: ConversationRuntime): void {
    this.touched = true;
    this.current = value;
    this.convoOwned = true;
    this.messagesOwned = true;
  }

  /** Replace the whole message list (owned by the caller from now on). */
  setMessages(messages: ChatMessage[]): void {
    this.touched = true;
    this.ensureConvo().messages = messages;
    this.messagesOwned = true;
  }

  pushMessage(message: ChatMessage): void {
    this.ensureMessages().push(message);
    this.owned.add(message);
  }

  /** Mark freshly created objects as owned so later edits in this flush mutate in place. */
  own<T extends object>(value: T): T {
    this.owned.add(value);
    return value;
  }

  isOwned(value: object): boolean {
    return this.owned.has(value);
  }

  editMessage(index: number): ChatMessage | undefined {
    const message = this.current.messages[index];
    if (!message) return undefined;
    if (this.owned.has(message)) return message;
    const copy: ChatMessage = { ...message };
    this.owned.add(copy);
    this.ensureMessages()[index] = copy;
    return copy;
  }

  editAssistant(index: number): AssistantMessage | undefined {
    if (this.current.messages[index]?.role !== "assistant") return undefined;
    const message = this.editMessage(index);
    return message?.role === "assistant" ? message : undefined;
  }

  editUser(index: number): UserMessage | undefined {
    if (this.current.messages[index]?.role !== "user") return undefined;
    const message = this.editMessage(index);
    return message?.role === "user" ? message : undefined;
  }

  /** Owned parts array of an owned assistant message. */
  editParts(message: AssistantMessage): MessagePart[] {
    const parts = message.parts;
    if (parts && this.owned.has(parts)) return parts;
    const copy = parts ? [...parts] : [];
    this.owned.add(copy);
    message.parts = copy;
    return copy;
  }

  /** Owned copy of one part of an owned assistant message. */
  editPart(message: AssistantMessage, partIndex: number): MessagePart | undefined {
    const parts = this.editParts(message);
    const part = parts[partIndex];
    if (!part) return undefined;
    if (this.owned.has(part)) return part;
    const copy: MessagePart = { ...part };
    this.owned.add(copy);
    parts[partIndex] = copy;
    return copy;
  }

  /** Owned (normalized) stream state of an owned assistant message. */
  editStreamState(message: AssistantMessage): StreamState {
    const state = message._streamState;
    if (state && this.owned.has(state)) return state;
    const copy: StreamState = {
      currentTurn: state?.currentTurn ?? 0,
      seenIndexes: { ...state?.seenIndexes },
      activeBlocks: { ...state?.activeBlocks },
      activeThinking: { ...state?.activeThinking },
    };
    this.owned.add(copy);
    message._streamState = copy;
    return copy;
  }

  private ensureConvo(): ConversationRuntime {
    if (!this.convoOwned) {
      this.current = { ...this.current };
      this.convoOwned = true;
    }
    return this.current;
  }

  private ensureMessages(): ChatMessage[] {
    const convo = this.ensureConvo();
    this.touched = true;
    if (!this.messagesOwned) {
      convo.messages = [...convo.messages];
      this.messagesOwned = true;
    }
    return convo.messages;
  }
}

/** One draft of the whole `byId` map; conversations are drafted lazily. */
export class StoreDraft {
  private readonly drafts = new Map<string, ConversationDraft>();
  readonly effects: StreamEffect[] = [];

  constructor(private readonly base: ReadonlyMap<string, ConversationRuntime>) {}

  conversation(id: string, fallback?: () => ConversationRuntime): ConversationDraft {
    let draft = this.drafts.get(id);
    if (!draft) {
      draft = new ConversationDraft(id, this.base.get(id), this.effects, fallback);
      this.drafts.set(id, draft);
    }
    return draft;
  }

  /** The next map: `base` itself when nothing changed, else ONE copy with the changed entries. */
  commit(): ReadonlyMap<string, ConversationRuntime> {
    let next: Map<string, ConversationRuntime> | null = null;
    for (const [id, draft] of this.drafts) {
      if (!draft.changed) continue;
      const value = draft.result();
      if (!value) continue;
      next ??= new Map(this.base);
      next.set(id, value);
    }
    return next ?? this.base;
  }
}
