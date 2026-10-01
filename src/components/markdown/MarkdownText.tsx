/**
 * Control-aware, block-split markdown (PERF #5).
 *
 * A text part is split into ```control segments and markdown; streaming
 * markdown is further split into top-level blocks rendered by memoized
 * `MarkdownBlock`s keyed by index, so each flush re-parses only the tail
 * block. Plugins are picked per block (raw HTML / math only when present), the
 * components map is one module constant, and `isStreaming` reaches code /
 * mermaid / control blocks through context.
 */
import { memo, useMemo, useState } from "react";
import Markdown from "react-markdown";
import { ValueControlBlock } from "../message/blocks";
import type { MessageCallbacks } from "../message/types";
import { MARKDOWN_COMPONENTS } from "./components";
import { MarkdownRenderContext, type MarkdownRenderState } from "./context";
import { htmlModule, mathModule, useLazyModule } from "./lazyModules";
import { type MarkdownVariant, selectPlugins } from "./plugins";
import { hasHtml, hasMath, sanitizeText, splitControlBlocks, splitMarkdownBlocks } from "./splitBlocks";
import { LARGE_TAIL_CHARS, useThrottledText } from "./useThrottledText";

interface MarkdownBlockProps extends MessageCallbacks {
  text: string;
  variant: MarkdownVariant;
  isStreaming: boolean;
}

const MarkdownBlock = memo(function MarkdownBlock({ text, variant, isStreaming, onAnswer, onControlChange, canControlTarget }: MarkdownBlockProps) {
  const math = useLazyModule(mathModule, variant === "assistant" && hasMath(text));
  const html = useLazyModule(htmlModule, variant === "assistant" && hasHtml(text));
  const plugins = selectPlugins(variant, html, math);
  const context = useMemo<MarkdownRenderState>(
    () => ({ isStreaming, onAnswer, onControlChange, canControlTarget }),
    [isStreaming, onAnswer, onControlChange, canControlTarget],
  );
  return (
    <MarkdownRenderContext.Provider value={context}>
      <Markdown remarkPlugins={plugins.remarkPlugins} rehypePlugins={plugins.rehypePlugins} components={MARKDOWN_COMPONENTS}>
        {text}
      </Markdown>
    </MarkdownRenderContext.Provider>
  );
});

interface MarkdownBlocksProps extends MessageCallbacks {
  text: string;
  variant: MarkdownVariant;
  isStreaming: boolean;
}

function MarkdownBlocks({ text, variant, isStreaming, ...callbacks }: MarkdownBlocksProps) {
  // Split mode is sticky: a part that streamed keeps its block structure after
  // the stream ends, so finishing never remounts its blocks.
  const [split, setSplit] = useState(isStreaming);
  if (isStreaming && !split) setSplit(true);

  const blocks = useMemo(() => (split ? splitMarkdownBlocks(text) : [text]), [split, text]);
  const lastIndex = blocks.length - 1;
  const tail = blocks[lastIndex] ?? "";
  const throttledTail = useThrottledText(tail, isStreaming && tail.length > LARGE_TAIL_CHARS);

  return (
    <>
      {blocks.map((block, index) => (
        <MarkdownBlock
          key={index}
          text={index === lastIndex ? throttledTail : block}
          variant={variant}
          isStreaming={isStreaming && index === lastIndex}
          {...callbacks}
        />
      ))}
    </>
  );
}

export interface MarkdownTextProps extends MessageCallbacks {
  text: string;
  /** Message/part is still streaming (only its tail block re-parses). */
  isStreaming?: boolean;
  variant?: MarkdownVariant;
}

/** Markdown with ```control fences extracted into ValueControlBlocks. */
function MarkdownText({ text, isStreaming = false, variant = "assistant", onAnswer, onControlChange, canControlTarget }: MarkdownTextProps) {
  const segments = useMemo(() => splitControlBlocks(text), [text]);
  const lastIndex = segments.length - 1;
  return (
    <>
      {segments.map((segment, index) => {
        if (segment.type === "control") {
          return (
            <ValueControlBlock
              key={index}
              json={segment.json}
              isStreaming={isStreaming}
              onAnswer={onAnswer}
              onControlChange={onControlChange}
              canControlTarget={canControlTarget}
            />
          );
        }
        if (!segment.text) return null;
        return (
          <MarkdownBlocks
            key={index}
            text={sanitizeText(segment.text)}
            variant={variant}
            isStreaming={isStreaming && index === lastIndex}
            onAnswer={onAnswer}
            onControlChange={onControlChange}
            canControlTarget={canControlTarget}
          />
        );
      })}
    </>
  );
}

export default memo(MarkdownText);
