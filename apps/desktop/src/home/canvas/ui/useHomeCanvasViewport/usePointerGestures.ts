import type React from "react";
import { useEffect, useRef } from "react";
import type { CanvasViewport } from "@/home/canvas/lib";
import { useDocumentSelectionLock } from "./documentSelectionLock";
import { releasePointerCapture } from "./pointerGestureMath";
import { useBeginPointerGestures } from "./useBeginPointerGestures";
import { usePointerMoveAndFinish } from "./usePointerMoveAndFinish";
import type {
  ActivePointer,
  UseHomeCanvasViewportOptions,
} from "./types";

export interface UsePointerGesturesOptions
  extends Pick<
    UseHomeCanvasViewportOptions,
    | "constraints"
    | "onViewportGestureStart"
    | "onViewportPanEnd"
    | "onWidgetDragStart"
    | "onWidgetDragEnd"
    | "onWidgetResizeStart"
    | "onWidgetResizeEnd"
    | "onWidgetResizeCancel"
  > {
  viewport: CanvasViewport;
  setViewport: React.Dispatch<React.SetStateAction<CanvasViewport>>;
  commitCamera: (nextViewport: CanvasViewport) => void;
  clearScheduledCameraSave: () => void;
}

export function usePointerGestures({
  viewport,
  setViewport,
  constraints,
  commitCamera,
  clearScheduledCameraSave,
  onViewportGestureStart,
  onViewportPanEnd,
  onWidgetDragStart,
  onWidgetDragEnd,
  onWidgetResizeStart,
  onWidgetResizeEnd,
  onWidgetResizeCancel,
}: UsePointerGesturesOptions) {
  const activePointerRef = useRef<ActivePointer | null>(null);
  const { lockDocumentSelection, unlockDocumentSelection } =
    useDocumentSelectionLock();

  useEffect(
    () => () => {
      clearScheduledCameraSave();
      const activePointer = activePointerRef.current;
      if (activePointer) {
        releasePointerCapture(activePointer);
      }
      unlockDocumentSelection();
    },
    [clearScheduledCameraSave, unlockDocumentSelection],
  );

  const { beginPan, beginWidgetDrag, beginWidgetResize } =
    useBeginPointerGestures({
      activePointerRef,
      viewport,
      lockDocumentSelection,
      onViewportGestureStart,
      onWidgetResizeStart,
    });

  const {
    dragPositions,
    resizePreviews,
    handlePointerMove,
    finishPointerGesture,
  } = usePointerMoveAndFinish({
    activePointerRef,
    setViewport,
    constraints,
    lockDocumentSelection,
    unlockDocumentSelection,
    commitCamera,
    clearScheduledCameraSave,
    onViewportPanEnd,
    onWidgetDragStart,
    onWidgetDragEnd,
    onWidgetResizeEnd,
    onWidgetResizeCancel,
  });

  return {
    dragPositions,
    resizePreviews,
    beginPan,
    beginWidgetDrag,
    beginWidgetResize,
    handlePointerMove,
    finishPointerGesture,
  };
}
