import { useEffect, useState } from "react";
import { nextSweepPosition } from "../lib";

const SWEEP_TICK_MS = 80;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

interface SweepFrame {
  readonly position: number;
  readonly direction: 1 | -1;
  readonly tick: number;
}

const FIRST_FRAME: SweepFrame = { position: 0, direction: 1, tick: 0 };

export function useSweepFrame(isRunning: boolean): SweepFrame {
  const [frame, setFrame] = useState<SweepFrame>(FIRST_FRAME);

  useEffect(() => {
    if (!isRunning || window.matchMedia(REDUCED_MOTION_QUERY).matches) return;
    const timer = window.setInterval(
      () =>
        setFrame((current) => ({
          ...nextSweepPosition(current.position, current.direction),
          tick: current.tick + 1,
        })),
      SWEEP_TICK_MS,
    );
    return () => window.clearInterval(timer);
  }, [isRunning]);

  return frame;
}
