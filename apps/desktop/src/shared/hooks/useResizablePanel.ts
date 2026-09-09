import { useCallback, useEffect, useRef, useState } from "react";
import { usePersistedState } from "./usePersistedState";

/**
 * Width-only panel resize, generalised from `useResizableSidebar`.
 *
 * `edge` says which side the drag rail lives on: a rail on a panel's left
 * edge (the right-hand inspector) grows the panel as the pointer moves left,
 * which is the opposite sign from a left sidebar's rail.
 */
export interface ResizablePanelOptions {
  storageKey: string;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
  edge?: "left" | "right";
}

export function useResizablePanel({
  storageKey,
  defaultWidth,
  minWidth,
  maxWidth,
  edge = "right",
}: ResizablePanelOptions) {
  const clamp = useCallback(
    (value: number) => Math.max(minWidth, Math.min(value, maxWidth)),
    [maxWidth, minWidth],
  );

  const [width, setWidth] = usePersistedState<number>(
    storageKey,
    defaultWidth,
    (value, defaults) =>
      typeof value === "number" && Number.isFinite(value)
        ? Math.max(minWidth, Math.min(value, maxWidth))
        : defaults,
  );
  const [resizing, setResizing] = useState(false);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const onResizeStart = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      dragRef.current = { startX: event.clientX, startWidth: width };
      setResizing(true);
    },
    [width],
  );

  const onResizeDoubleClick = useCallback(
    () => setWidth(defaultWidth),
    [defaultWidth, setWidth],
  );

  useEffect(() => {
    if (!resizing) return;

    const onMove = (event: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const delta = event.clientX - drag.startX;
      setWidth(clamp(drag.startWidth + (edge === "left" ? -delta : delta)));
    };
    const onUp = () => {
      dragRef.current = null;
      setResizing(false);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [clamp, edge, resizing, setWidth]);

  return { width, resizing, onResizeStart, onResizeDoubleClick };
}
