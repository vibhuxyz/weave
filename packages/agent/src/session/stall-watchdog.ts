import type { SessionUpdate, ToolCallStatus } from "@weave/protocol";

const RUNNING_TOOL_STATUS: ToolCallStatus = "in_progress";
const UNTITLED_TOOL_TITLE = "tool call";

export interface StallReport {
  readonly timeoutMs: number;
  readonly runningTools: readonly string[];
}

export interface StallWatchdog {
  /** Start watching. The returned promise rejects if the engine goes quiet. */
  arm(timeoutMs?: number): Promise<never>;
  /** Record engine activity. Restarts the countdown. */
  touch(): void;
  observe(update: SessionUpdate): void;
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
  readonly runningToolTimeoutMs: number;
  readonly onStall: (report: StallReport) => Error;
}

function nextRunningTools(
  running: ReadonlyMap<string, string>,
  update: SessionUpdate,
): ReadonlyMap<string, string> {
  if (update.sessionUpdate !== "tool_call" && update.sessionUpdate !== "tool_call_update") return running;
  const { toolCallId, status, title } = update;
  const next = new Map(running);
  if (status === RUNNING_TOOL_STATUS) {
    next.set(toolCallId, title ?? running.get(toolCallId) ?? UNTITLED_TOOL_TITLE);
  } else if (status) {
    next.delete(toolCallId);
  } else if (title && running.has(toolCallId)) {
    next.set(toolCallId, title);
  }
  return next;
}

export function createStallWatchdog({
  timeoutMs,
  runningToolTimeoutMs,
  onStall,
}: StallWatchdogOptions): StallWatchdog {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let fail: ((error: Error) => void) | null = null;
  let holds = 0;
  let activeTimeoutMs = timeoutMs;
  let runningTools: ReadonlyMap<string, string> = new Map();

  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const currentWindowMs = () =>
    runningTools.size > 0 ? Math.max(activeTimeoutMs, runningToolTimeoutMs) : activeTimeoutMs;

  const start = () => {
    clear();
    if (holds > 0 || !fail) return;
    const windowMs = currentWindowMs();
    timer = setTimeout(() => {
      const reject = fail;
      fail = null;
      clear();
      reject?.(onStall({ timeoutMs: windowMs, runningTools: [...runningTools.values()] }));
    }, windowMs);
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
    observe(update: SessionUpdate) {
      runningTools = nextRunningTools(runningTools, update);
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
      runningTools = new Map();
      clear();
    },
  };
}
