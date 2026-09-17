import { usePointerGestures } from "./useHomeCanvasViewport/usePointerGestures";
import { useViewportCamera } from "./useHomeCanvasViewport/useViewportCamera";
import type { UseHomeCanvasViewportOptions } from "./useHomeCanvasViewport/types";

export function useHomeCanvasViewport({
  camera,
  constraints,
  saveCamera,
  onViewportGestureStart,
  onViewportPanEnd,
  onWidgetDragStart,
  onWidgetDragEnd,
  onWidgetResizeStart,
  onWidgetResizeEnd,
  onWidgetResizeCancel,
}: UseHomeCanvasViewportOptions) {
  const {
    canvasRef,
    viewport,
    setViewport,
    canvasSize,
    worldPointForClientPoint,
    handleWheel,
    commitCamera,
    clearScheduledCameraSave,
  } = useViewportCamera({
    camera,
    constraints,
    saveCamera,
    onViewportGestureStart,
  });

  const {
    dragPositions,
    resizePreviews,
    beginPan,
    beginWidgetDrag,
    beginWidgetResize,
    handlePointerMove,
    finishPointerGesture,
  } = usePointerGestures({
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
  });

  return {
    canvasRef,
    viewport,
    canvasSize,
    dragPositions,
    resizePreviews,
    worldPointForClientPoint,
    beginPan,
    beginWidgetDrag,
    beginWidgetResize,
    handlePointerMove,
    finishPointerGesture,
    handleWheel,
  };
}
