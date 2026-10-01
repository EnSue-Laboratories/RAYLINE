/**
 * Typed views of the message blocks owned by chat-blocks (still
 * `// @ts-nocheck`, so their props infer as `any`). Cast once here.
 * TODO(ts-boundary): drop these casts once chat-blocks lands.
 */
import type { ComponentType, RefObject } from "react";
import type { ToolPart } from "@shared/chat/types";
import AskUserQuestionBlockUntyped from "../AskUserQuestionBlock";
import CopyBtnUntyped from "../CopyBtn";
import CopyImageBtnUntyped from "../CopyImageBtn";
import InteractiveBlockUntyped from "../InteractiveBlock";
import MermaidBlockUntyped from "../MermaidBlock";
import ThinkingBlockUntyped from "../ThinkingBlock";
import ToolCallBlockUntyped from "../ToolCallBlock";
import ValueControlBlockUntyped from "../ValueControlBlock";
import type { AnswerHandler, CanControlTarget, ControlChangeHandler, WallpaperLike } from "./types";

export const ToolCallBlock = ToolCallBlockUntyped as ComponentType<{ tool: ToolPart }>;
export const AskUserQuestionBlock = AskUserQuestionBlockUntyped as ComponentType<{ tool: ToolPart; onAnswer?: AnswerHandler }>;
export const ThinkingBlock = ThinkingBlockUntyped as ComponentType<{ text: string; isThinking: boolean; durationMs?: number }>;
export const MermaidBlock = MermaidBlockUntyped as ComponentType<{ code: string }>;
export const InteractiveBlock = InteractiveBlockUntyped as ComponentType<{ code: string; isStreaming: boolean }>;
export const ValueControlBlock = ValueControlBlockUntyped as ComponentType<{
  json: string;
  isStreaming: boolean;
  onAnswer?: AnswerHandler;
  onControlChange?: ControlChangeHandler;
  canControlTarget?: CanControlTarget;
}>;
export const CopyBtn = CopyBtnUntyped as ComponentType<{ text: string; title?: string }>;
export const CopyImageBtn = CopyImageBtnUntyped as ComponentType<{
  targetRef: RefObject<HTMLElement | null>;
  title?: string;
  wallpaper?: WallpaperLike | null;
}>;
