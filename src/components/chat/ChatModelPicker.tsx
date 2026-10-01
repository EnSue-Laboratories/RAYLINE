import { memo, useMemo } from "react";
import type { EffortLevel, ModelDefinition } from "@shared/models/types";
import ModelPicker from "../ModelPicker";
import { useMulticaModels } from "../../data/multicaModels";
import { useOpenCodeModels } from "../../data/openCodeModels";

const NO_MODELS: readonly ModelDefinition[] = [];

interface ChatModelPickerProps {
  value: string;
  onChange: (modelId: string) => void;
  extraModels?: readonly ModelDefinition[];
  effort?: EffortLevel | null;
  onEffortChange?: (effort: EffortLevel | null) => void;
}

/**
 * Header model picker: the settings ModelPicker with Multica agents and
 * OpenCode models listed, plus the per-conversation effort selector
 * (ModelPickerWithMultica does not forward effort props yet).
 */
function ChatModelPicker({ value, onChange, extraModels = NO_MODELS, effort, onEffortChange }: ChatModelPickerProps) {
  const { models: multicaModels, error, loading } = useMulticaModels();
  const { models: openCodeModels } = useOpenCodeModels();
  const allExtraModels = useMemo(() => [...extraModels, ...openCodeModels, ...multicaModels], [extraModels, openCodeModels, multicaModels]);
  return (
    <ModelPicker
      value={value}
      onChange={onChange}
      extraModels={allExtraModels}
      extraError={error}
      extraLoading={loading}
      effort={effort}
      onEffortChange={onEffortChange}
    />
  );
}

export default memo(ChatModelPicker);
