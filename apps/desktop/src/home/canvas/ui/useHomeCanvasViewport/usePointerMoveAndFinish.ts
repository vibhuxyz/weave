import type React from "react";
import { useCallback, useState, type RefObject } from "react";
import {
  eventClientPoint,
  movedBeyondWidgetDragThreshold,
  offsetBetween,
  panCanvasViewport,
  type CanvasPoint,
  type CanvasViewport,
  type ResolvedWidgetResize,
} from "@/home/canvas/lib";
import type { LayoutConstraints } from "@/home/canvas/layout";
import {
  markWidgetDragStarted,
  releasePointerCapture,
  widgetPositionFromOffset,
  widgetResizeFromOffset,
} from "./pointerGestureMath";
import type {
  ActivePointer,
  UseHomeCanvasViewportOptions,
} from "./types";

export interface UsePointerMoveAndFinishOptions
  extends Pick<
    UseHomeCanvasViewportOptions,
    | "constraints"
    | "onViewportPanEnd"
    | "onWidgetDragStart"
    | "onWidgetDragEnd"
    | "onWidgetResizeEnd"
    | "onWidgetResizeCancel"
  > {
  activePointerRef: RefObject<ActivePointer | null>;
  setViewport: React.Dispatch<React.SetStateAction<CanvasViewport>>;
  lockDocumentSelection: () => void;
  unlockDocumentSelection: () => void;
  commitCamera: (nextViewport: CanvasViewport) => void;
  clearScheduledCameraSave: () => void;
}

export function usePointerMoveAndFinish({
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
}: UsePointerMoveAndFinishOptions) {
  const [dragPositions, setDragPositions] = useState<
    Record<string, CanvasPoint>
  >({});
  const [resizePreviews, setResizePreviews] = useState<
    Record<string, ResolvedWidgetResize>
  >({});

  const clearWidgetDragPosition = useCallback(
    (widgetId: string) =>
      setDragPositions(({ [widgetId]: _removed, ...rest }) => rest),
    [],
  );

  const clearWidgetResizePreview = useCallback(
    (widgetId: string) =>
      setResizePreviews(({ [widgetId]: _removed, ...rest }) => rest),
    [],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const activePointer = activePointerRef.current;
      if (!activePointer || activePointer.pointerId !== event.pointerId) {
        return;
      }

      const eventClient = eventClientPoint(event);

      if (activePointer.kind === "pan") {
        setViewport(
          panCanvasViewport(
            activePointer.startViewport,
            activePointer.startClient,
            eventClient,
          ),
        );
        return;
      }

      const offset = offsetBetween(eventClient, activePointer.startClient);
      if (activePointer.kind === "resize") {
        setResizePreviews((current) => ({
          ...current,
          [activePointer.widgetId]: widgetResizeFromOffset(
            activePointer,
            constraints,
            offset,
          ),
        }));
        return;
      }

      if (!activePointer.didDrag && !movedBeyondWidgetDragThreshold(offset)) {
        return;
      }
      if (!activePointer.didDrag) {
        lockDocumentSelection();
        markWidgetDragStarted(activePointer, onWidgetDragStart, true);
      }

      const nextPosition = widgetPositionFromOffset(activePointer, offset);
      setDragPositions((current) => ({
        ...current,
        [activePointer.widgetId]: nextPosition,
      }));
    },
    [
      activePointerRef,
      constraints,
      lockDocumentSelection,
      onWidgetDragStart,
      setViewport,
    ],
  );

  const finishPointerGesture = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const activePointer = activePointerRef.current;
      if (!activePointer || activePointer.pointerId !== event.pointerId) {
        return;
      }

      activePointerRef.current = null;
      unlockDocumentSelection();
      if (
        activePointer.kind === "pan" ||
        activePointer.kind === "resize" ||
        activePointer.hasCapture
      ) {
        releasePointerCapture(activePointer);
      }

      if (event.type === "pointercancel") {
        if (activePointer.kind === "pan") {
          setViewport(activePointer.startViewport);
          return;
        }

        if (activePointer.kind === "resize") {
          clearWidgetResizePreview(activePointer.widgetId);
          onWidgetResizeCancel?.({ id: activePointer.widgetId });
          return;
        }

        clearWidgetDragPosition(activePointer.widgetId);
        return;
      }

      const eventClient = eventClientPoint(event);
      const offset = offsetBetween(eventClient, activePointer.startClient);

      if (activePointer.kind === "pan") {
        const moved = offset.x !== 0 || offset.y !== 0;
        onViewportPanEnd?.(moved);
        if (!moved) {
          return;
        }

        const nextViewport = panCanvasViewport(
          activePointer.startViewport,
          activePointer.startClient,
          eventClient,
        );
        setViewport(nextViewport);
        commitCamera(nextViewport);
        return;
      }

      if (activePointer.kind === "resize") {
        if (offset.x === 0 && offset.y === 0) {
          clearWidgetResizePreview(activePointer.widgetId);
          onWidgetResizeCancel?.({ id: activePointer.widgetId });
          return;
        }

        const finalBounds = widgetResizeFromOffset(
          activePointer,
          constraints,
          offset,
        );

        clearScheduledCameraSave();
        onWidgetResizeEnd?.({
          id: activePointer.widgetId,
          bounds: finalBounds,
          offset,
        });
        clearWidgetResizePreview(activePointer.widgetId);
        return;
      }

      if (!activePointer.didDrag && !movedBeyondWidgetDragThreshold(offset)) {
        return;
      }
      if (!activePointer.didDrag) {
        markWidgetDragStarted(activePointer, onWidgetDragStart, false);
      }

      const finalPosition = widgetPositionFromOffset(activePointer, offset);

      clearScheduledCameraSave();
      onWidgetDragEnd?.({
        id: activePointer.widgetId,
        position: finalPosition,
        offset,
      });
      clearWidgetDragPosition(activePointer.widgetId);
    },
    [
      activePointerRef,
      clearScheduledCameraSave,
      clearWidgetDragPosition,
      clearWidgetResizePreview,
      commitCamera,
      constraints,
      onViewportPanEnd,
      onWidgetDragEnd,
      onWidgetDragStart,
      onWidgetResizeCancel,
      onWidgetResizeEnd,
      setViewport,
      unlockDocumentSelection,
    ],
  );

  return {
    dragPositions,
    resizePreviews,
    handlePointerMove,
    finishPointerGesture,
  };
}
