import { useEffect, useState } from "react";

const TICK_MS = 1_000;

export function useElapsedMs(startedAt: number, settledAt: number | null): number {
  const isRunning = settledAt === null;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isRunning) return;
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(timer);
  }, [isRunning]);

  return Math.max(0, (settledAt ?? now) - startedAt);
}
