import { type ClipboardEvent, type Dispatch, type DragEvent, type SetStateAction, useCallback, useEffect, useRef, useState } from "react";
import type { Attachment } from "@shared/chat/types";
import { clipboardItemsToAttachments, dataTransferHasFiles, fileListToAttachments } from "../../utils/attachments";

export interface ComposerDropHandlers {
  handleDrop: (event: DragEvent) => void;
  handleDragEnter: (event: DragEvent) => void;
  handleDragOver: (event: DragEvent) => void;
  handleDragLeave: (event: DragEvent) => void;
  resetDragState: () => void;
}

export interface ComposerAttachments extends ComposerDropHandlers {
  attachments: Attachment[];
  setAttachments: Dispatch<SetStateAction<Attachment[]>>;
  dragOver: boolean;
  handlePaste: (event: ClipboardEvent) => void;
  removeAttachment: (index: number) => void;
}

/** Attachment list + paste / whole-pane drag-and-drop state for the composer. */
export function useComposerAttachments(initial: () => Attachment[]): ComposerAttachments {
  const [attachments, setAttachments] = useState<Attachment[]>(initial);
  const [dragOver, setDragOver] = useState(false);
  const dragDepthRef = useRef(0);

  const append = useCallback((next: Attachment[]) => {
    if (next.length > 0) setAttachments((prev) => [...prev, ...next]);
  }, []);

  const handlePaste = useCallback(
    (event: ClipboardEvent) => {
      const items = Array.from(event.clipboardData?.items ?? []);
      if (!items.some((item) => item?.kind === "file")) return;
      event.preventDefault();
      void clipboardItemsToAttachments(items).then(append);
    },
    [append],
  );

  const resetDragState = useCallback(() => {
    dragDepthRef.current = 0;
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent) => {
      if (!dataTransferHasFiles(event.dataTransfer)) return;
      event.preventDefault();
      event.stopPropagation();
      resetDragState();
      void fileListToAttachments(event.dataTransfer?.files).then(append);
    },
    [append, resetDragState],
  );

  const handleDragEnter = useCallback((event: DragEvent) => {
    if (!dataTransferHasFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current += 1;
    setDragOver(true);
  }, []);

  const handleDragOver = useCallback((event: DragEvent) => {
    if (!dataTransferHasFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((event: DragEvent) => {
    if (!dataTransferHasFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragOver(false);
  }, []);

  useEffect(() => {
    window.addEventListener("drop", resetDragState);
    window.addEventListener("dragend", resetDragState);
    return () => {
      window.removeEventListener("drop", resetDragState);
      window.removeEventListener("dragend", resetDragState);
    };
  }, [resetDragState]);

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  return { attachments, setAttachments, dragOver, handlePaste, handleDrop, handleDragEnter, handleDragOver, handleDragLeave, resetDragState, removeAttachment };
}
