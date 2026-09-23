export interface StallWatchdog {
  /** Start watching. The returned promise rejects if the engine goes quiet. */
  arm(timeoutMs?: number): Promise<never>;
  /** Record engine activity. Restarts the countdown. */
  touch(): void;
  /**
   * Hold the countdown while the turn is legitimately blocked on someone else
   * — a permission request sitting in front of a human produces no engine
   * traffic, and killing the engine mid-question is not a stall. Nests.
   */
  pause(): void;
  resume(): void;
  disarm(): void;
}

export interface StallWatchdogOptions {
  readonly timeoutMs: number;
  readonly onStall: (timeoutMs: number) => Error;
}

export function createStallWatchdog({
  timeoutMs,
  onStall,
}: StallWatchdogOptions): StallWatchdog {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let fail: ((error: Error) => void) | null = null;
  let holds = 0;
  let activeTimeoutMs = timeoutMs;

  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const start = () => {
    clear();
    if (holds > 0 || !fail) return;
    timer = setTimeout(() => {
      const reject = fail;
      fail = null;
      clear();
      reject?.(onStall(activeTimeoutMs));
    }, activeTimeoutMs);
    timer.unref?.();
  };

  return {
    arm(overrideMs?: number) {
      activeTimeoutMs = overrideMs ?? timeoutMs;
      return new Promise<never>((_resolve, reject) => {
        fail = reject;
        start();
      });
    },
    touch() {
      start();
    },
    pause() {
      holds += 1;
      clear();
    },
    resume() {
      if (holds > 0) holds -= 1;
      if (holds === 0) start();
    },
    disarm() {
      fail = null;
      holds = 0;
      activeTimeoutMs = timeoutMs;
      clear();
    },
  };
}
