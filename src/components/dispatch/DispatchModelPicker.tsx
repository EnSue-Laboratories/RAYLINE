import type { ComponentType } from "react";
import type { EffortLevel, ModelDefinition } from "@shared/models";
import ModelPickerUntyped from "../ModelPicker";

/**
 * ModelPicker props Dispatch relies on (the #230 picker API plus effort).
 * The settings package owns ModelPicker and adds these in parallel.
 */
export interface DispatchModelPickerProps {
  value: string;
  onChange: (modelId: string) => void;
  /** Dynamic models (remote / upstream / OpenCode / Multica) to list. */
  extraModels?: readonly ModelDefinition[];
  effort?: EffortLevel | null;
  onEffortChange?: (effort: EffortLevel | null) => void;
  compact?: boolean;
  ariaLabel?: string;
  /** The dispatch modal sits at z-index 1000. */
  menuZIndex?: number;
  /** "planner" limits the list to models that can plan. */
  purpose?: "chat" | "planner";
  /** Shows an "inherit" entry resolving to this model when `value` is "". */
  inheritModelId?: string;
  disabled?: boolean;
}

// TODO(ts-boundary): drop the cast once settings lands the typed ModelPicker
// with catalog / compact / ariaLabel / menuZIndex / purpose / inheritModelId /
// disabled / effort props.
const DispatchModelPicker = ModelPickerUntyped as unknown as ComponentType<DispatchModelPickerProps>;

export default DispatchModelPicker;
