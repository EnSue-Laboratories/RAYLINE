import { useMemo, useRef } from "react";
import type { AssistantMessage as AssistantMessageValue } from "@shared/chat/types";
import { useFontScale } from "../../contexts/FontSizeContext";
import LoadingStatus from "../LoadingStatus";
import MarkdownText from "../markdown/MarkdownText";
import { TEXT_WRAP_STYLE } from "../markdown/context";
import AssistantParts from "./AssistantParts";
import { CopyBtn, CopyImageBtn, ThinkingBlock, ToolCallBlock } from "./blocks";
import { MESSAGE_ROOT_STYLE } from "./styles";
import type { MessageCallbacks, WallpaperLike } from "./types";

interface AssistantMessageProps extends MessageCallbacks {
  message: AssistantMessageValue;
  modelId: string;
  wallpaper?: WallpaperLike | null;
}

export default function AssistantMessage({ message, modelId, wallpaper, onAnswer, onControlChange, canControlTarget }: AssistantMessageProps) {
  const s = useFontScale();
  const captureRef = useRef<HTMLDivElement>(null);
  const hasThinkingPart = Boolean(message.parts?.some((part) => part.type === "thinking"));
  const copyText = useMemo(() => {
    if (message.parts) {
      return message.parts
        .filter((part) => part.type === "text" && part.text)
        .map((part) => (part.type === "text" ? part.text : ""))
        .join("\n");
    }
    return message.text || "";
  }, [message.parts, message.text]);
  const showStatus = Boolean(message.isStreaming || message._usage || message._rateLimits || message._startedAt || message._elapsedMs != null);

  return (
    <div style={{ ...MESSAGE_ROOT_STYLE, marginBottom: 44, animation: "msgIn .4s cubic-bezier(.16,1,.3,1)", textAlign: "left", paddingTop: 8 }}>
      <div ref={captureRef}>
        <div
          style={{
            fontSize: s(9),
            fontFamily: "var(--font-mono)",
            color: "var(--text-muted)",
            letterSpacing: ".14em",
            marginBottom: 12,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          ASSISTANT
        </div>

        <AssistantParts message={message} onAnswer={onAnswer} onControlChange={onControlChange} canControlTarget={canControlTarget} />

        {message.isThinking && !hasThinkingPart && (
          <div data-copy-image-ignore="true">
            <ThinkingBlock text="" isThinking />
          </div>
        )}

        {showStatus && (
          <div data-copy-image-ignore="true">
            <LoadingStatus
              startedAt={message._startedAt}
              elapsedMs={message._elapsedMs}
              usage={message._usage}
              rateLimits={message._rateLimits}
              isStreaming={Boolean(message.isStreaming)}
              modelId={modelId}
              compacting={Boolean(message._compacting)}
            />
          </div>
        )}

        {/* Legacy messages: plain `text` + `toolCalls` instead of `parts`. */}
        {!message.parts && message.text && (
          <div style={{ color: "var(--text-primary)", fontSize: s(15), lineHeight: 1.85, fontFamily: "var(--font-content)", letterSpacing: "0.008em", ...TEXT_WRAP_STYLE }}>
            <MarkdownText text={message.text} onAnswer={onAnswer} onControlChange={onControlChange} canControlTarget={canControlTarget} />
          </div>
        )}
        {!message.parts &&
          message.toolCalls?.map((tool) => (
            <div key={tool.id} data-copy-image-ignore="true">
              <ToolCallBlock tool={tool} />
            </div>
          ))}
      </div>

      {!message.isStreaming && copyText && (
        <div data-copy-image-ignore="true" style={{ marginTop: 8, display: "flex", gap: 6 }}>
          <CopyBtn text={copyText} title="Copy markdown" />
          <CopyImageBtn targetRef={captureRef} wallpaper={wallpaper} />
        </div>
      )}
    </div>
  );
}
