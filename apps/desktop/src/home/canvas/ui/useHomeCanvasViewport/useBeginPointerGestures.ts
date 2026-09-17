import type React from "react";
import { useCallback, type RefObject } from "react";
import { eventClientPoint, type CanvasViewport } from "@/home/canvas/lib";
import type { WidgetInstance } from "@/home/canvas/widgets";
import type {
  ActivePointer,
  UseHomeCanvasViewportOptions,
} from "./types";

export interface UseBeginPointerGesturesOptions
  extends Pick<
    UseHomeCanvasViewportOptions,
    "onViewportGestureStart" | "onWidgetResizeStart"
  > {
  activePointerRef: RefObject<ActivePointer | null>;
  viewport: CanvasViewport;
  lockDocumentSelection: () => void;
}

export function useBeginPointerGestures({
  activePointerRef,
  viewport,
  lockDocumentSelection,
  onViewportGestureStart,
  onWidgetResizeStart,
}: UseBeginPointerGesturesOptions) {
  const beginPan = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      lockDocumentSelection();
      event.currentTarget.setPointerCapture(event.pointerId);
      onViewportGestureStart?.("pan");
      activePointerRef.current = {
        kind: "pan",
        pointerId: event.pointerId,
        captureElement: event.currentTarget,
        startClient: eventClientPoint(event),
        startViewport: viewport,
      };
    },
    [activePointerRef, lockDocumentSelection, onViewportGestureStart, viewport],
  );

  const beginWidgetDrag = useCallback(
    (event: React.PointerEvent<HTMLElement>, instance: WidgetInstance) => {
      if (typeof event.button === "number" && event.button !== 0) {
        return;
      }

      onViewportGestureStart?.("widget");
      activePointerRef.current = {
        kind: "widget",
        pointerId: event.pointerId,
        captureElement: event.currentTarget,
        hasCapture: false,
        widgetId: instance.id,
        startClient: eventClientPoint(event),
        startViewport: viewport,
        startPosition: { x: instance.x, y: instance.y },
        didDrag: false,
        instance,
      };
    },
    [activePointerRef, onViewportGestureStart, viewport],
  );

  const beginWidgetResize = useCallback(
    (event: React.PointerEvent<HTMLElement>, instance: WidgetInstance) => {
      if (typeof event.button === "number" && event.button !== 0) {
        return;
      }

      lockDocumentSelection();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      onViewportGestureStart?.("resize");
      onWidgetResizeStart?.(instance);
      activePointerRef.current = {
        kind: "resize",
        pointerId: event.pointerId,
        captureElement: event.currentTarget,
        widgetId: instance.id,
        startClient: eventClientPoint(event),
        startViewport: viewport,
        instance,
      };
    },
    [
      activePointerRef,
      lockDocumentSelection,
      onViewportGestureStart,
      onWidgetResizeStart,
      viewport,
    ],
  );

  return { beginPan, beginWidgetDrag, beginWidgetResize };
}
