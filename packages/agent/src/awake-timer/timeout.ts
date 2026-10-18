import { startAwakeClock, tickAwakeClock } from "./clock.ts";
import { AWAKE_TICK_MS, SUSPEND_GAP_MS } from "./constants.ts";
import type { AwakeClock, AwakeTimeout, AwakeTimeoutOptions } from "./types.ts";

interface TimerState {
  clock: AwakeClock;
  timer: ReturnType<typeof setTimeout> | null;
  isUnref: boolean;
}

export function setAwakeTimeout(onTimeout: () => void, delayMs: number, options: AwakeTimeoutOptions = {}): AwakeTimeout {
  const now = options.now ?? Date.now;
  const state: TimerState = { clock: startAwakeClock(now()), timer: null, isUnref: false };
  const schedule = (remainingMs: number): void => {
    state.timer = setTimeout(check, Math.min(AWAKE_TICK_MS, remainingMs));
    if (state.isUnref) state.timer.unref?.();
  };
  const check = (): void => {
    state.clock = tickAwakeClock(state.clock, now(), SUSPEND_GAP_MS);
    const remainingMs = delayMs - state.clock.awakeMs;
    if (remainingMs > 0) return schedule(remainingMs);
    state.timer = null;
    onTimeout();
  };
  schedule(Math.max(0, delayMs));
  return {
    clear: () => {
      if (state.timer) clearTimeout(state.timer);
      state.timer = null;
    },
    unref: () => {
      state.isUnref = true;
      state.timer?.unref?.();
    },
  };
}
