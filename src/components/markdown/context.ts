import { createContext } from "react";
import type { MessageCallbacks } from "../message/types";

/**
 * Per-block render state for the (single, stable) markdown components object.
 * Passing `isStreaming` through context instead of swapping component maps
 * means a block finishing its stream re-renders its code/mermaid blocks in
 * place instead of remounting them (PERF #5).
 */
export interface MarkdownRenderState extends MessageCallbacks {
  isStreaming: boolean;
}

export const MarkdownRenderContext = createContext<MarkdownRenderState>({ isStreaming: false });

/** Shared text-wrapping rules for prose (PR #230). */
export const TEXT_WRAP_STYLE = {
  overflowWrap: "break-word",
  wordBreak: "normal",
  lineBreak: "strict",
  textWrap: "pretty",
} as const;
