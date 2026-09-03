import { useCallback, useEffect, useRef, useState } from "react";
import { usePersistedState } from "./usePersistedState";

/**
 * Width-only sidebar resize, ported from berd's `useResizableSidebar`
 * (which also does height + corner resize — dropped here). Drag the rail on
 * the sidebar's right edge; drag it narrower than the snap threshold and the
 * sidebar collapses.
 */
const STORAGE_KEY = "berd:sidebar:width";
const DEFAULT_WIDTH = 224;
const MIN_WIDTH = 200;
const MAX_WIDTH = 420;
const SNAP_COLLAPSE_THRESHOLD = 120;

function clampWidth(value: number) {
  return Math.max(MIN_WIDTH, Math.min(value, MAX_WIDTH));
}

export function useResizableSidebar(onSnapCollapse: () => void) {
  const [width, setWidth] = usePersistedState<number>(
    STORAGE_KEY,
    DEFAULT_WIDTH,
    (value, defaults) =>
      typeof value === "number" && Number.isFinite(value)
        ? clampWidth(value)
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

  const onResizeDoubleClick = useCallback(() => setWidth(DEFAULT_WIDTH), [setWidth]);

  useEffect(() => {
    if (!resizing) return;

    const onMove = (event: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const next = drag.startWidth + (event.clientX - drag.startX);
      if (next < SNAP_COLLAPSE_THRESHOLD) {
        onSnapCollapse();
        return;
      }
      setWidth(clampWidth(next));
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
  }, [resizing, onSnapCollapse, setWidth]);

  return { width, resizing, onResizeStart, onResizeDoubleClick };
}
