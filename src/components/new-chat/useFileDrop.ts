import { useEffect, useRef, useState, type DragEvent } from "react";
import { useStableCallback } from "../../hooks/useStableCallback";
import { dataTransferHasFiles } from "./boundaries";

export interface FileDrop {
  dragOver: boolean;
  handlers: {
    onDrop: (e: DragEvent<HTMLElement>) => void;
    onDragEnter: (e: DragEvent<HTMLElement>) => void;
    onDragOver: (e: DragEvent<HTMLElement>) => void;
    onDragLeave: (e: DragEvent<HTMLElement>) => void;
  };
}

/**
 * Whole-area file drop zone with a depth counter (child enter/leave pairs)
 * and a window-level reset when a drag ends elsewhere.
 */
export function useFileDrop(onFiles: (files: FileList) => void): FileDrop {
  const [dragOver, setDragOver] = useState(false);
  const depthRef = useRef(0);
  const handleFiles = useStableCallback(onFiles);

  useEffect(() => {
    const reset = () => {
      depthRef.current = 0;
      setDragOver(false);
    };
    window.addEventListener("drop", reset);
    window.addEventListener("dragend", reset);
    return () => {
      window.removeEventListener("drop", reset);
      window.removeEventListener("dragend", reset);
    };
  }, []);

  const [handlers] = useState<FileDrop["handlers"]>(() => ({
    onDrop: (e) => {
      if (!dataTransferHasFiles(e.dataTransfer)) return;
      e.preventDefault();
      e.stopPropagation();
      depthRef.current = 0;
      setDragOver(false);
      handleFiles(e.dataTransfer.files);
    },
    onDragEnter: (e) => {
      if (!dataTransferHasFiles(e.dataTransfer)) return;
      e.preventDefault();
      e.stopPropagation();
      depthRef.current += 1;
      setDragOver(true);
    },
    onDragOver: (e) => {
      if (!dataTransferHasFiles(e.dataTransfer)) return;
      e.preventDefault();
      e.stopPropagation();
      setDragOver(true);
    },
    onDragLeave: (e) => {
      if (!dataTransferHasFiles(e.dataTransfer)) return;
      e.preventDefault();
      e.stopPropagation();
      depthRef.current = Math.max(0, depthRef.current - 1);
      if (depthRef.current === 0) setDragOver(false);
    },
  }));

  return { dragOver, handlers };
}
