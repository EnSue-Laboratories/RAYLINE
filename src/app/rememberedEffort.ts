/** Store-bound accessors for the per-model effort memory (see effortMemory). */

import { useMemo } from "react";
import type { EffortLevel } from "@shared/models/types";
import { getAppSettings, useAppSetting } from "../store/appSettings";
import { rememberedEffort } from "./effortMemory";
import { resolveModel } from "./stores/models";

export function getRememberedEffort(modelId: string): EffortLevel | null {
  return rememberedEffort(getAppSettings().effortByModel, modelId, resolveModel(modelId));
}

export function useRememberedEffort(modelId: string): EffortLevel | null {
  const memory = useAppSetting("effortByModel");
  return useMemo(() => rememberedEffort(memory, modelId, resolveModel(modelId)), [memory, modelId]);
}
