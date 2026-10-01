/**
 * Windowed transcript (PERF #6). Subscribes to the conversations store by id:
 * the list re-renders only when messages are added / removed, and each row
 * only when its own message object changes.
 *
 * Opening a conversation mounts the last WINDOW_SIZE messages; a sentinel at
 * the top prepends WINDOW_STEP more when the reader scrolls up to it, and the
 * scroll position is compensated by the scrollHeight delta before paint.
 */
import { memo, type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Wallpaper } from "@shared/state/types";
import { useMessage, useMessageIds } from "../../store/conversations";
import Message from "../Message";
import type { CanControlTarget, ControlChangeHandler, EditHandler } from "../message/types";
import { expandWindowStart, resolveWindowStart, scrollTopAfterPrepend } from "./logic";

interface RowProps {
  conversationId: string;
  messageId: string;
  index: number;
  modelId: string;
  wallpaper?: Wallpaper | null;
  onEdit?: EditHandler;
  onAnswer?: (text: string) => void;
  onControlChange?: ControlChangeHandler;
  canControlTarget?: CanControlTarget;
}

const TranscriptRow = memo(function TranscriptRow({ conversationId, messageId, index, ...rest }: RowProps) {
  const message = useMessage(conversationId, messageId);
  if (!message) return null;
  return (
    <Message
      msg={message}
      messageIndex={index}
      canEdit={message.role === "user" && message.mode !== "shell-command"}
      modelId={rest.modelId}
      onEdit={rest.onEdit}
      onAnswer={rest.onAnswer}
      onControlChange={rest.onControlChange}
      canControlTarget={rest.canControlTarget}
      wallpaper={rest.wallpaper}
    />
  );
});

export interface ChatTranscriptProps extends Omit<RowProps, "messageId" | "index"> {
  messageBodyRef: (node: HTMLDivElement | null) => void;
  endRef: RefObject<HTMLDivElement | null>;
  scrollRef: RefObject<HTMLDivElement | null>;
  followingRef: RefObject<boolean>;
}

const SENTINEL_MARGIN = "600px 0px 0px 0px";

function ChatTranscript({ messageBodyRef, endRef, scrollRef, followingRef, ...rowProps }: ChatTranscriptProps) {
  const ids = useMessageIds(rowProps.conversationId);
  const [anchor, setAnchor] = useState<number | null>(null);
  const start = resolveWindowStart(anchor, ids.length);
  if (start !== anchor) setAnchor(start);
  const windowStart = start ?? 0;

  const pendingPrependRef = useRef<{ scrollTop: number; scrollHeight: number } | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const sentinelVisibleRef = useRef(false);

  const loadEarlier = useCallback(() => {
    const el = scrollRef.current;
    if (windowStart === 0 || pendingPrependRef.current || !el) return;
    // Only when the reader went up (or nothing scrolls yet).
    const canScroll = el.scrollHeight > el.clientHeight + 1;
    if (canScroll && followingRef.current) return;
    pendingPrependRef.current = { scrollTop: el.scrollTop, scrollHeight: el.scrollHeight };
    setAnchor((current) => expandWindowStart(current));
  }, [followingRef, scrollRef, windowStart]);

  // Keep the reader's content in place after older messages mount above it.
  useLayoutEffect(() => {
    const pending = pendingPrependRef.current;
    const el = scrollRef.current;
    if (!pending || !el) return;
    pendingPrependRef.current = null;
    el.scrollTop = scrollTopAfterPrepend(pending.scrollTop, pending.scrollHeight, el.scrollHeight);
  }, [windowStart, scrollRef]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = scrollRef.current;
    if (!sentinel || !root || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        sentinelVisibleRef.current = entries.some((entry) => entry.isIntersecting);
        if (sentinelVisibleRef.current) loadEarlier();
      },
      { root, rootMargin: SENTINEL_MARGIN },
    );
    observer.observe(sentinel);
    // Follow-mode flips on scroll; re-check a sentinel that was already visible.
    const onScroll = (): void => {
      if (sentinelVisibleRef.current) loadEarlier();
    };
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      observer.disconnect();
      root.removeEventListener("scroll", onScroll);
    };
  }, [loadEarlier, scrollRef, windowStart]);

  return (
    <div ref={messageBodyRef} style={{ maxWidth: 640, width: "100%", margin: "0 auto", flex: 1 }}>
      {windowStart > 0 && <div ref={sentinelRef} aria-hidden="true" style={{ height: 1 }} />}
      {ids.slice(windowStart).map((messageId, offset) => (
        <TranscriptRow key={messageId} messageId={messageId} index={windowStart + offset} {...rowProps} />
      ))}
      <div ref={endRef} />
    </div>
  );
}

export default memo(ChatTranscript);
