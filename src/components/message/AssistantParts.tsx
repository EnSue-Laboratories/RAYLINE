/**
 * Assistant parts in order (text, thinking, tools, images, status, errors).
 * Each part renders through a memoized `PartView`: with copy-on-write stream
 * flushes only the part that changed re-renders. Tool runs collapse into
 * `ToolCallGroup`s.
 */
import { memo, useMemo } from "react";
import { ASK_USER_QUESTION_TOOL, type AssistantMessage, type MessagePart } from "@shared/chat/types";
import { useFontScale } from "../../contexts/FontSizeContext";
import MarkdownText from "../markdown/MarkdownText";
import { TEXT_WRAP_STYLE } from "../markdown/context";
import AssistantImage from "./AssistantImage";
import { AskUserQuestionBlock, ThinkingBlock, ToolCallBlock } from "./blocks";
import { normalizeAssistantImagePart } from "./images";
import { ErrorBlock, StatusBlock } from "./PartBlocks";
import { groupParts, visibleParts } from "./partGroups";
import ToolCallGroup from "./ToolCallGroup";
import type { MessageCallbacks } from "./types";

const EMPTY_PARTS: readonly MessagePart[] = [];

interface PartViewProps extends MessageCallbacks {
  part: MessagePart;
  /** This text part is the streaming tail. */
  streaming: boolean;
  /** This thinking part is still thinking. */
  thinking: boolean;
}

const PartView = memo(function PartView({ part, streaming, thinking, onAnswer, onControlChange, canControlTarget }: PartViewProps) {
  const s = useFontScale();
  switch (part.type) {
    case "text":
      if (!part.text) return null;
      return (
        <div
          style={{
            color: "var(--text-primary)",
            fontSize: s(15),
            lineHeight: 1.85,
            fontFamily: "var(--font-content)",
            letterSpacing: "0.008em",
            marginBottom: 4,
            ...TEXT_WRAP_STYLE,
          }}
        >
          <MarkdownText text={part.text} isStreaming={streaming} onAnswer={onAnswer} onControlChange={onControlChange} canControlTarget={canControlTarget} />
        </div>
      );
    case "image": {
      const image = normalizeAssistantImagePart(part);
      if (!image) return null;
      return (
        <div style={{ margin: "4px 0 8px" }}>
          <AssistantImage {...image} />
        </div>
      );
    }
    case "thinking":
      return (
        <div data-copy-image-ignore="true">
          <ThinkingBlock text={part.text} isThinking={thinking} durationMs={part.durationMs} />
        </div>
      );
    case "tool":
      return (
        <div data-copy-image-ignore="true">
          {part.name === ASK_USER_QUESTION_TOOL ? <AskUserQuestionBlock tool={part} onAnswer={onAnswer} /> : <ToolCallBlock tool={part} />}
        </div>
      );
    case "status":
      return <StatusBlock part={part} />;
    case "error":
      return <ErrorBlock part={part} />;
    default: {
      const unhandled: never = part;
      return unhandled;
    }
  }
});

function partKey(part: MessagePart, index: number): string {
  switch (part.type) {
    case "tool":
      return `tool-${part.id || index}`;
    case "image":
      return `img-${part.id || index}`;
    default:
      return `${part.type}-${index}`;
  }
}

interface AssistantPartsProps extends MessageCallbacks {
  message: AssistantMessage;
}

export default function AssistantParts({ message, onAnswer, onControlChange, canControlTarget }: AssistantPartsProps) {
  const allParts = message.parts ?? EMPTY_PARTS;
  // Codex housekeeping notices are kept in the transcript but not displayed.
  const parts = useMemo(() => visibleParts(allParts), [allParts]);
  const live = Boolean(message.isStreaming);
  const items = useMemo(() => groupParts(parts, live), [parts, live]);
  const activeThinking = message._streamState?.activeThinking;
  const lastUnkeyedThinkingIndex = useMemo(
    () => parts.reduce((latest, part, index) => (part.type === "thinking" && !part._streamKey ? index : latest), -1),
    [parts],
  );
  const lastIndex = parts.length - 1;

  return (
    <>
      {items.map((item) => {
        if (item.kind === "tools") {
          return <ToolCallGroup key={`tools-${item.start}`} parts={parts.slice(item.start, item.end)} />;
        }
        const part = parts[item.index];
        if (!part) return null;
        const thinking =
          part.type === "thinking" &&
          (part._streamKey
            ? Boolean(activeThinking?.[part._streamKey])
            : Boolean(message.isThinking) && item.index === lastUnkeyedThinkingIndex && !Number.isFinite(part.durationMs));
        return (
          <PartView
            key={partKey(part, item.index)}
            part={part}
            streaming={live && item.index === lastIndex}
            thinking={thinking}
            onAnswer={onAnswer}
            onControlChange={onControlChange}
            canControlTarget={canControlTarget}
          />
        );
      })}
    </>
  );
}
