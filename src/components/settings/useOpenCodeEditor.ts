import { useState } from "react";
import type { OpenCodeModelEntry } from "@shared/providers/types";
import { useStableCallback } from "../../hooks/useStableCallback";
import type { OpenCodeModelsHook, Translate } from "./deps";
import {
  clearOpenCodeDraft,
  INITIAL_OPENCODE_DRAFT,
  openCodeDraftFromModel,
  openCodeDuplicateDraft,
  resolveOpenCodeApiKey,
  toOpenCodeProviderConfig,
  validateOpenCodeDraft,
  type OpenCodeDraft,
} from "./helpers";

/** Which form is open: none, add, edit (dialog) or duplicate. */
export type OpenCodeEditorMode =
  | { kind: "closed" }
  | { kind: "add" }
  | { kind: "edit"; modelId: string }
  | { kind: "duplicate"; sourceId: string };

export type OpenCodeMessage = { tone: "success" | "warning"; text: string } | null;

export interface OpenCodeEditor {
  mode: OpenCodeEditorMode;
  draft: OpenCodeDraft;
  saving: boolean;
  message: OpenCodeMessage;
  updateDraft: (patch: Partial<OpenCodeDraft>) => void;
  startAdd: () => void;
  startEdit: (model: OpenCodeModelEntry) => void;
  startDuplicate: (model: OpenCodeModelEntry) => Promise<void>;
  cancel: () => void;
  save: () => Promise<void>;
  remove: (modelKey: string) => void;
  toggleEnabled: (model: OpenCodeModelEntry) => void;
}

const CLOSED: OpenCodeEditorMode = { kind: "closed" };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "";
}

/** Add / edit / duplicate state machine for user-configured OpenCode models. */
export function useOpenCodeEditor(
  t: Translate,
  { rawModels, saveModel, removeModel, refresh }: Pick<OpenCodeModelsHook, "rawModels" | "saveModel" | "removeModel" | "refresh">,
): OpenCodeEditor {
  const [mode, setMode] = useState<OpenCodeEditorMode>(CLOSED);
  const [draft, setDraft] = useState<OpenCodeDraft>(INITIAL_OPENCODE_DRAFT);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<OpenCodeMessage>(null);

  const updateDraft = useStableCallback((patch: Partial<OpenCodeDraft>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
    setMessage(null);
  });

  const open = (next: OpenCodeEditorMode) => {
    setMode(next);
    setMessage(null);
  };

  const startAdd = useStableCallback(() => {
    open({ kind: "add" });
    setDraft(clearOpenCodeDraft);
  });

  const startEdit = useStableCallback((model: OpenCodeModelEntry) => {
    open({ kind: "edit", modelId: model.id });
    setDraft(openCodeDraftFromModel(model));
  });

  const startDuplicate = useStableCallback(async (model: OpenCodeModelEntry) => {
    open({ kind: "duplicate", sourceId: model.id });
    let providerConfig = toOpenCodeProviderConfig(null);
    try {
      providerConfig = toOpenCodeProviderConfig(
        await window.api?.opencodeGetProviderConfig?.(model.providerId || INITIAL_OPENCODE_DRAFT.providerId),
      );
    } catch {
      // Fall back to the model's own credentials.
    }
    setDraft(openCodeDuplicateDraft(model, providerConfig));
  });

  const cancel = useStableCallback(() => {
    open(CLOSED);
    setDraft(clearOpenCodeDraft);
  });

  const save = useStableCallback(async () => {
    const editingId = mode.kind === "edit" ? mode.modelId : "";
    const duplicateSourceId = mode.kind === "duplicate" ? mode.sourceId : "";
    const validation = validateOpenCodeDraft(draft, duplicateSourceId);
    if (!validation.ok) {
      setMessage({ tone: "warning", text: t(validation.errorKey) });
      return;
    }
    const { providerId, modelId, modelKey } = validation;
    setSaving(true);
    setMessage(null);
    try {
      const apiKey = resolveOpenCodeApiKey(draft, editingId, rawModels, modelKey);
      await window.api?.opencodeSaveConfig?.({ providerId, modelId, apiKey, baseURL: draft.baseURL, setDefault: true });
      saveModel({
        providerId,
        modelId,
        label: draft.label,
        apiKey,
        baseURL: draft.baseURL,
        enabled: draft.enabled,
        thinking: draft.thinking,
      });
      if (editingId && editingId !== modelKey) removeModel(editingId);
      setDraft(clearOpenCodeDraft);
      await refresh();
      setMode(CLOSED);
      setMessage({ tone: "success", text: t("settings.opencodeSaved") });
    } catch (error) {
      setMessage({ tone: "warning", text: errorMessage(error) || t("settings.opencodeSaveFailed") });
    } finally {
      setSaving(false);
    }
  });

  const remove = useStableCallback((modelKey: string) => {
    removeModel(modelKey);
    setMessage(null);
  });

  const toggleEnabled = useStableCallback((model: OpenCodeModelEntry) => {
    saveModel({ ...model, enabled: model.enabled === false });
    setMessage(null);
  });

  return { mode, draft, saving, message, updateDraft, startAdd, startEdit, startDuplicate, cancel, save, remove, toggleEnabled };
}
