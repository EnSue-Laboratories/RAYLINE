/**
 * Typed views of modules other packages are still converting. Each cast is
 * a TODO(ts-boundary) to drop once the owning package lands.
 */

import type { ComponentType } from "react";
import type { Attachment } from "@shared/chat/types";
import type { EffortLevel, ModelDefinition } from "@shared/models";
import type { ProjectMeta } from "@shared/state/types";
import ProjectPickerUntyped from "../ProjectPicker";
import { ModelPickerWithMultica as ModelPickerWithMulticaTyped } from "../../data/multicaModels";
import * as attachmentUtilsUntyped from "../../utils/attachments";

export interface ProjectPickerProps {
  /** Selected project root; null = Drafts. */
  value: string | null;
  onChange: (cwd: string | null) => void;
  allCwdRoots?: readonly string[];
  projects?: Readonly<Record<string, ProjectMeta>>;
  onBrowse?: () => void;
}

// TODO(ts-boundary): drop once sidebar-nav converts src/components/ProjectPicker.tsx.
export const ProjectPicker = ProjectPickerUntyped as unknown as ComponentType<ProjectPickerProps>;

export interface NewChatModelPickerProps {
  value: string;
  onChange: (modelId: string) => void;
  extraModels?: readonly ModelDefinition[];
  effort?: EffortLevel | null;
  onEffortChange?: (effort: EffortLevel | null) => void;
}

// TODO(ts-boundary): drop once ModelPickerWithMultica forwards `effort` /
// `onEffortChange` to the settings ModelPicker.
export const ModelPickerWithMultica = ModelPickerWithMulticaTyped as ComponentType<NewChatModelPickerProps>;

interface AttachmentUtils {
  clipboardItemsToAttachments: (items: readonly DataTransferItem[]) => Promise<Attachment[]>;
  dataTransferHasFiles: (dataTransfer: DataTransfer | null | undefined) => boolean;
  fileListToAttachments: (files: FileList | null | undefined) => Promise<Attachment[]>;
}

// TODO(ts-boundary): drop once src/utils/attachments.ts is converted.
export const { clipboardItemsToAttachments, dataTransferHasFiles, fileListToAttachments } =
  attachmentUtilsUntyped as unknown as AttachmentUtils;
