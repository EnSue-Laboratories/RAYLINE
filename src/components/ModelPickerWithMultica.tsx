import { memo, useMemo } from "react";
import type { EffortLevel, ModelDefinition } from "@shared/models";
import { useMulticaModels } from "../data/multicaModels";
import { useOpenCodeModels } from "../data/openCodeModels";
import ModelPicker from "./ModelPicker";

const NO_MODELS: readonly ModelDefinition[] = [];

export interface ModelPickerWithMulticaProps {
  /** Selected model id. */
  value: string;
  onChange: (modelId: string) => void;
  extraModels?: readonly ModelDefinition[];
  /** Per-conversation reasoning effort; null = the model's default. */
  effort?: EffortLevel | null;
  /** Shows the effort selector (for models that have efforts) when provided. */
  onEffortChange?: (effort: EffortLevel | null) => void;
  /** Menu z-index; raise it inside modals. */
  menuZIndex?: number;
}

/** The shared ModelPicker with Multica agents and OpenCode models listed alongside the catalog. */
const ModelPickerWithMultica = memo(function ModelPickerWithMultica({
  value,
  onChange,
  extraModels = NO_MODELS,
  effort,
  onEffortChange,
  menuZIndex,
}: ModelPickerWithMulticaProps) {
  const { models, error, loading } = useMulticaModels();
  const { models: openCodeModels } = useOpenCodeModels();
  const allExtraModels = useMemo(
    () => [...extraModels, ...openCodeModels, ...models],
    [extraModels, openCodeModels, models],
  );
  return (
    <ModelPicker
      value={value}
      onChange={onChange}
      extraModels={allExtraModels}
      extraError={error}
      extraLoading={loading}
      effort={effort}
      onEffortChange={onEffortChange}
      menuZIndex={menuZIndex}
    />
  );
});

export default ModelPickerWithMultica;
