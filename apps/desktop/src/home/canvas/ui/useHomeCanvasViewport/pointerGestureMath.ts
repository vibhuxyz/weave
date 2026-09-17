import type React from "react";
import { resolveWidgetResizeFromOffset, type CanvasPoint, type ResolvedWidgetResize } from "@/home/canvas/lib";
import type { LayoutConstraints } from "@/home/canvas/layout";
import type { WidgetInstance } from "@/home/canvas/widgets";
import type { ActivePointer } from "./types";

export function viewportSize(element: HTMLElement | null) {
  const rect = element?.getBoundingClientRect();
  return {
    width: rect?.width ?? 0,
    height: rect?.height ?? 0,
  };
}

export function wheelDeltaPixels(
  event: React.WheelEvent<HTMLElement>,
  viewport: ReturnType<typeof viewportSize>,
): CanvasPoint {
  const multiplier =
    event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.height : 1;

  return {
    x: (event.deltaX ?? 0) * multiplier,
    y: (event.deltaY ?? 0) * multiplier,
  };
}

export function releasePointerCapture({
  captureElement,
  pointerId,
}: ActivePointer): void {
  if (captureElement.hasPointerCapture?.(pointerId) === false) {
    return;
  }
  captureElement.releasePointerCapture?.(pointerId);
}

export function markWidgetDragStarted(
  activePointer: Extract<ActivePointer, { kind: "widget" }>,
  onWidgetDragStart: ((instance: WidgetInstance) => void) | undefined,
  capturePointer: boolean,
): void {
  activePointer.didDrag = true;

  if (capturePointer && activePointer.captureElement.setPointerCapture) {
    activePointer.captureElement.setPointerCapture(activePointer.pointerId);
    activePointer.hasCapture = true;
  }

  onWidgetDragStart?.(activePointer.instance);
}

export function widgetPositionFromOffset(
  activePointer: Extract<ActivePointer, { kind: "widget" }>,
  offset: CanvasPoint,
): CanvasPoint {
  const { startPosition, startViewport } = activePointer;
  return {
    x: startPosition.x + offset.x / startViewport.zoom,
    y: startPosition.y + offset.y / startViewport.zoom,
  };
}

export function widgetResizeFromOffset(
  activePointer: Extract<ActivePointer, { kind: "resize" }>,
  constraints: LayoutConstraints,
  offset: CanvasPoint,
): ResolvedWidgetResize {
  return resolveWidgetResizeFromOffset({
    instance: activePointer.instance,
    offset,
    viewportZoom: activePointer.startViewport.zoom,
    bounds: constraints,
  });
}
