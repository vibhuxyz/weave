import { useEffect, useState } from "react";
import { SPLASH_MAX_WAIT_MS, SPLASH_MIN_VISIBLE_MS } from "./constants";
import { resolveStartupStage, type StartupSignals } from "./startup-stage";

function useElapsedFlag(delayMs: number): boolean {
  const [hasElapsed, setHasElapsed] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setHasElapsed(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);
  return hasElapsed;
}

export function useStartupSplash(signals: StartupSignals): {
  readonly isVisible: boolean;
  readonly message: string;
  readonly progress: number;
} {
  const stage = resolveStartupStage(signals);
  const hasShownLongEnough = useElapsedFlag(SPLASH_MIN_VISIBLE_MS);
  const hasWaitedTooLong = useElapsedFlag(SPLASH_MAX_WAIT_MS);
  const isVisible = !((stage.isSettled && hasShownLongEnough) || hasWaitedTooLong);
  return { isVisible, message: stage.message, progress: stage.progress };
}
