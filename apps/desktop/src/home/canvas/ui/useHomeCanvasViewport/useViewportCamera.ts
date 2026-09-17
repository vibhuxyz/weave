import type React from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { LayoutCamera, LayoutConstraints } from "@/home/canvas/layout";
import {
  canvasViewportToLayoutCamera,
  clampLayoutCamera,
  layoutCameraToCanvasViewport,
  panCanvasViewportByDelta,
  screenToWorld,
  zoomCanvasViewportAtPoint,
  zoomCanvasViewportByScaleAtPoint,
  type CanvasPoint,
  type CanvasViewport,
} from "@/home/canvas/lib";
import { viewportSize, wheelDeltaPixels } from "./pointerGestureMath";
import type { WebkitGestureEvent } from "./types";

export interface UseViewportCameraOptions {
  camera: LayoutCamera;
  constraints: LayoutConstraints;
  saveCamera: (camera: LayoutCamera) => void;
  onViewportGestureStart?: (kind: "pan" | "widget" | "resize" | "zoom") => void;
}

const CAMERA_SAVE_DEBOUNCE_MS = 150;

export function useViewportCamera({
  camera,
  constraints,
  saveCamera,
  onViewportGestureStart,
}: UseViewportCameraOptions) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const cameraSaveTimerRef = useRef<number | null>(null);
  const gestureScaleRef = useRef<number | null>(null);
  const [viewport, setViewport] = useState<CanvasViewport>(() =>
    layoutCameraToCanvasViewport(camera, { width: 0, height: 0 }, constraints),
  );
  const [canvasSize, setCanvasSize] = useState(() => viewportSize(null));

  const viewportCamera = useCallback(
    (nextViewport: CanvasViewport) =>
      canvasViewportToLayoutCamera(
        nextViewport,
        viewportSize(canvasRef.current),
        constraints,
      ),
    [constraints],
  );

  const clearScheduledCameraSave = useCallback(() => {
    if (cameraSaveTimerRef.current !== null) {
      window.clearTimeout(cameraSaveTimerRef.current);
      cameraSaveTimerRef.current = null;
    }
  }, []);

  const commitCamera = useCallback(
    (nextViewport: CanvasViewport) => {
      clearScheduledCameraSave();
      saveCamera(viewportCamera(nextViewport));
    },
    [clearScheduledCameraSave, saveCamera, viewportCamera],
  );

  const scheduleCameraSave = useCallback(
    (nextViewport: CanvasViewport) => {
      clearScheduledCameraSave();
      cameraSaveTimerRef.current = window.setTimeout(() => {
        cameraSaveTimerRef.current = null;
        commitCamera(nextViewport);
      }, CAMERA_SAVE_DEBOUNCE_MS);
    },
    [clearScheduledCameraSave, commitCamera],
  );

  const syncViewportToCamera = useCallback(() => {
    const size = viewportSize(canvasRef.current);
    setCanvasSize(size);
    if (size.width <= 0 || size.height <= 0) {
      return;
    }

    setViewport(
      layoutCameraToCanvasViewport(
        clampLayoutCamera(camera, constraints),
        size,
        constraints,
      ),
    );
  }, [camera, constraints]);

  useLayoutEffect(() => {
    syncViewportToCamera();
  }, [syncViewportToCamera]);

  useEffect(() => {
    const element = canvasRef.current;
    if (!element) {
      return;
    }

    syncViewportToCamera();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", syncViewportToCamera);
      return () => window.removeEventListener("resize", syncViewportToCamera);
    }

    const resizeObserver = new ResizeObserver(() => {
      syncViewportToCamera();
    });
    resizeObserver.observe(element);

    return () => resizeObserver.disconnect();
  }, [syncViewportToCamera]);

  const worldPointForClientPoint = useCallback(
    (point: CanvasPoint): CanvasPoint => {
      const rect = canvasRef.current?.getBoundingClientRect();
      const screenPoint = {
        x: point.x - (rect?.left ?? 0),
        y: point.y - (rect?.top ?? 0),
      };
      return screenToWorld(screenPoint, viewport);
    },
    [viewport],
  );

  const handleWheel = useCallback(
    (event: React.WheelEvent<HTMLElement>) => {
      event.preventDefault();

      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }

      onViewportGestureStart?.(event.ctrlKey || event.metaKey ? "zoom" : "pan");

      setViewport((currentViewport) => {
        const nextViewport =
          event.ctrlKey || event.metaKey
            ? zoomCanvasViewportAtPoint(
                currentViewport,
                {
                  x: event.clientX - rect.left,
                  y: event.clientY - rect.top,
                },
                event.deltaY,
                constraints,
              )
            : panCanvasViewportByDelta(
                currentViewport,
                wheelDeltaPixels(event, rect),
              );

        scheduleCameraSave(nextViewport);
        return nextViewport;
      });
    },
    [constraints, onViewportGestureStart, scheduleCameraSave],
  );

  useEffect(() => {
    const element = canvasRef.current;
    if (!element) {
      return;
    }

    const handleGestureStart = (event: WebkitGestureEvent) => {
      event.preventDefault();
      gestureScaleRef.current = event.scale ?? 1;
      onViewportGestureStart?.("zoom");
    };

    const handleGestureChange = (event: WebkitGestureEvent) => {
      event.preventDefault();

      const rect = element.getBoundingClientRect();
      const currentScale = event.scale ?? gestureScaleRef.current ?? 1;
      const previousScale = gestureScaleRef.current ?? 1;
      gestureScaleRef.current = currentScale;

      if (currentScale <= 0 || previousScale <= 0) {
        return;
      }

      const zoomFactor = currentScale / previousScale;
      setViewport((currentViewport) => {
        const nextViewport = zoomCanvasViewportByScaleAtPoint(
          currentViewport,
          {
            x: (event.clientX ?? rect.left + rect.width / 2) - rect.left,
            y: (event.clientY ?? rect.top + rect.height / 2) - rect.top,
          },
          zoomFactor,
          constraints,
        );
        scheduleCameraSave(nextViewport);
        return nextViewport;
      });
    };

    const handleGestureEnd = () => {
      gestureScaleRef.current = null;
    };

    element.addEventListener("gesturestart", handleGestureStart);
    element.addEventListener("gesturechange", handleGestureChange);
    element.addEventListener("gestureend", handleGestureEnd);

    return () => {
      element.removeEventListener("gesturestart", handleGestureStart);
      element.removeEventListener("gesturechange", handleGestureChange);
      element.removeEventListener("gestureend", handleGestureEnd);
    };
  }, [constraints, onViewportGestureStart, scheduleCameraSave]);

  return {
    canvasRef,
    viewport,
    setViewport,
    canvasSize,
    worldPointForClientPoint,
    handleWheel,
    commitCamera,
    scheduleCameraSave,
    clearScheduledCameraSave,
  };
}
