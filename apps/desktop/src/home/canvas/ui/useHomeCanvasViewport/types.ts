import type { LayoutCamera, LayoutConstraints } from "@/home/canvas/layout";
import type { CanvasPoint, CanvasViewport, ResolvedWidgetResize } from "@/home/canvas/lib";
import type { WidgetInstance } from "@/home/canvas/widgets";

export type ActivePointer =
  | {
      kind: "pan";
      pointerId: number;
      captureElement: HTMLElement;
      startClient: CanvasPoint;
      startViewport: CanvasViewport;
    }
  | {
      kind: "widget";
      pointerId: number;
      captureElement: HTMLElement;
      hasCapture: boolean;
      widgetId: string;
      startClient: CanvasPoint;
      startViewport: CanvasViewport;
      startPosition: CanvasPoint;
      didDrag: boolean;
      instance: WidgetInstance;
    }
  | {
      kind: "resize";
      pointerId: number;
      captureElement: HTMLElement;
      widgetId: string;
      startClient: CanvasPoint;
      startViewport: CanvasViewport;
      instance: WidgetInstance;
    };

export type WidgetDragEnd = {
  id: string;
  position: CanvasPoint;
  offset: CanvasPoint;
};

export type WidgetResizeEnd = {
  id: string;
  bounds: ResolvedWidgetResize;
  offset: CanvasPoint;
};

export type WidgetResizeCancel = {
  id: string;
};

export type WebkitGestureEvent = Event & {
  clientX?: number;
  clientY?: number;
  scale?: number;
};

export interface UseHomeCanvasViewportOptions {
  camera: LayoutCamera;
  constraints: LayoutConstraints;
  saveCamera: (camera: LayoutCamera) => void;
  onViewportGestureStart?: (kind: "pan" | "widget" | "resize" | "zoom") => void;
  onViewportPanEnd?: (moved: boolean) => void;
  onWidgetDragStart?: (instance: WidgetInstance) => void;
  onWidgetDragEnd?: (drag: WidgetDragEnd) => void;
  onWidgetResizeStart?: (instance: WidgetInstance) => void;
  onWidgetResizeEnd?: (resize: WidgetResizeEnd) => void;
  onWidgetResizeCancel?: (resize: WidgetResizeCancel) => void;
}
