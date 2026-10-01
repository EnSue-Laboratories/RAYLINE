/**
 * One transcript message (public entry; renderers live in ./message/).
 * Memoized: with copy-on-write stream flushes only the streaming message gets
 * a new `msg`, and every callback is wrapped in a stable proxy so parent
 * handler churn never re-renders finished messages.
 */
import { memo } from "react";
import type { ChatMessage } from "@shared/chat/types";
import { useStableCallback } from "../hooks/useStableCallback";
import AssistantMessage from "./message/AssistantMessage";
import SystemMessage from "./message/SystemMessage";
import type { AnswerHandler, CanControlTarget, ControlChange, ControlChangeHandler, EditHandler, WallpaperLike } from "./message/types";
import UserMessage from "./message/UserMessage";

export type { AnswerHandler, CanControlTarget, ControlChange, ControlChangeHandler, EditHandler, WallpaperLike };

export interface MessageProps {
  msg: ChatMessage;
  modelId: string;
  messageIndex: number;
  canEdit?: boolean;
  onEdit?: EditHandler;
  onAnswer?: AnswerHandler;
  onControlChange?: ControlChangeHandler;
  canControlTarget?: CanControlTarget;
  wallpaper?: WallpaperLike | null;
}

const noop = (): void => {};

function Message({ msg, modelId, messageIndex, canEdit = false, onEdit, onAnswer, onControlChange, canControlTarget, wallpaper }: MessageProps) {
  // Stable proxies keep memoized parts / markdown blocks from re-rendering
  // when the parent passes fresh handlers. Optional handlers stay optional.
  const stableOnAnswer = useStableCallback(onAnswer ?? noop);
  const stableOnControlChange = useStableCallback(onControlChange ?? noop);
  const stableOnEdit = useStableCallback(onEdit ?? noop);
  const callbacks = {
    onAnswer: onAnswer ? stableOnAnswer : undefined,
    onControlChange: onControlChange ? stableOnControlChange : undefined,
    canControlTarget,
  };

  switch (msg.role) {
    case "user":
      return <UserMessage message={msg} messageIndex={messageIndex} canEdit={canEdit} onEdit={onEdit ? stableOnEdit : undefined} {...callbacks} />;
    case "system":
      return <SystemMessage message={msg} {...callbacks} />;
    case "assistant":
      return <AssistantMessage message={msg} modelId={modelId} wallpaper={wallpaper} {...callbacks} />;
    default: {
      const unhandled: never = msg;
      return unhandled;
    }
  }
}

export default memo(Message);
