/**
 * Transcript scroll behaviour: sticky follow-mode, one batched rAF pin per
 * frame, ResizeObserver pinning for late layout (images, KaTeX, mermaid,
 * footer growth), and the scroll-to-bottom button state.
 */
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";

export interface ScrollManager {
  scrollRef: RefObject<HTMLDivElement | null>;
  endRef: RefObject<HTMLDivElement | null>;
  /** Mutable: true until the user actively scrolls up; back on at the bottom. */
  followingRef: RefObject<boolean>;
  /** Callback ref for the message body (ResizeObserver target). */
  setMessageBodyNode: (node: HTMLDivElement | null) => void;
  /** Same node as an object ref (SelectionToolbar). */
  messageBodyRef: RefObject<HTMLDivElement | null>;
  showScrollToBottom: boolean;
  scrollToBottom: () => void;
}

const FOLLOW_RESUME_PX = 40;
const SHOW_BUTTON_PX = 120;
const USER_INTENT_WINDOW_MS = 500;

export function useScrollManager(conversationKey: string | null, messageCount: number): ScrollManager {
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const followingRef = useRef(true);
  const prevMessageCount = useRef(0);
  const messageBodyRef = useRef<HTMLDivElement | null>(null);
  const [messageBodyEl, setMessageBodyEl] = useState<HTMLDivElement | null>(null);
  const setMessageBodyNode = useCallback((node: HTMLDivElement | null) => {
    messageBodyRef.current = node;
    setMessageBodyEl(node);
  }, []);

  // All "pin to bottom" writes coalesce into one rAF so there is never more
  // than one synchronous scrollTop write per frame.
  const pinFrameRef = useRef<number | null>(null);
  const schedulePinToBottom = useCallback(() => {
    if (pinFrameRef.current != null) return;
    pinFrameRef.current = requestAnimationFrame(() => {
      pinFrameRef.current = null;
      const el = scrollRef.current;
      if (followingRef.current && el) el.scrollTop = el.scrollHeight;
    });
  }, []);
  const cancelPinFrame = useCallback(() => {
    if (pinFrameRef.current == null) return;
    cancelAnimationFrame(pinFrameRef.current);
    pinFrameRef.current = null;
  }, []);

  // A new conversation starts following (don't inherit "scrolled up").
  useEffect(() => {
    followingRef.current = true;
    prevMessageCount.current = 0;
    cancelPinFrame();
  }, [conversationKey, cancelPinFrame]);

  useEffect(() => cancelPinFrame, [cancelPinFrame]);

  useEffect(() => {
    if (!scrollRef.current) return;
    if (messageCount > prevMessageCount.current) {
      // New message → follow and glide to the end.
      prevMessageCount.current = messageCount;
      followingRef.current = true;
      endRef.current?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    if (messageCount < prevMessageCount.current) {
      // Rewind / clear / compact: track, don't hijack the position.
      prevMessageCount.current = messageCount;
      return;
    }
    if (followingRef.current) schedulePinToBottom();
  }, [messageCount, schedulePinToBottom]);

  // Streaming growth (and anything else that changes the body height) pins
  // while following; replaces the old per-commit text-diff trigger.
  useEffect(() => {
    if (!messageBodyEl || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => {
      if (followingRef.current) schedulePinToBottom();
    });
    observer.observe(messageBodyEl);
    return () => observer.disconnect();
  }, [messageBodyEl, schedulePinToBottom]);

  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const showButtonRef = useRef(false);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    let lastScrollTop = el.scrollTop;
    // "Scrolled up" only counts right after real input; content shrink and
    // momentum bounce must not silently drop follow-mode.
    let userIntentUntil = 0;
    const markIntent = (): void => {
      userIntentUntil = Date.now() + USER_INTENT_WINDOW_MS;
    };
    const handleScroll = (): void => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (el.scrollTop < lastScrollTop - 8 && Date.now() < userIntentUntil) followingRef.current = false;
      if (distanceFromBottom < FOLLOW_RESUME_PX) followingRef.current = true;
      lastScrollTop = el.scrollTop;
      const nextShow = distanceFromBottom > SHOW_BUTTON_PX;
      if (showButtonRef.current !== nextShow) {
        showButtonRef.current = nextShow;
        setShowScrollToBottom(nextShow);
      }
    };
    handleScroll();
    el.addEventListener("scroll", handleScroll, { passive: true });
    el.addEventListener("wheel", markIntent, { passive: true });
    el.addEventListener("touchstart", markIntent, { passive: true });
    el.addEventListener("pointerdown", markIntent, { passive: true });
    el.addEventListener("keydown", markIntent);
    return () => {
      el.removeEventListener("scroll", handleScroll);
      el.removeEventListener("wheel", markIntent);
      el.removeEventListener("touchstart", markIntent);
      el.removeEventListener("pointerdown", markIntent);
      el.removeEventListener("keydown", markIntent);
    };
  }, [conversationKey, messageCount]);

  const scrollToBottom = useCallback(() => {
    followingRef.current = true;
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  return { scrollRef, endRef, followingRef, setMessageBodyNode, messageBodyRef, showScrollToBottom, scrollToBottom };
}
