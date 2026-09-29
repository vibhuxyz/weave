import type { WorkerStatus } from "@weave/protocol";
import { transitionWorker } from "../dag/index.ts";
import type { RunWorker, WorkerInput, WorkerOutcome } from "../pool/index.ts";
import { chooseRuntime } from "./capability.ts";
import { watchHeartbeat } from "./heartbeat.ts";
import { backoffFor, DEFAULT_RETRY, shouldRetry } from "./retry.ts";
import type { AttemptInspection, RetryPolicy, RuntimeProfile, StopReason, WorkerAttempt, WorkerTrace } from "./types.ts";

const MIN_STALL_TICK_MS = 10;
const STOP_PHRASE: Readonly<Record<StopReason, string>> = {
  timeout: "timed out",
  stalled: "stalled",
  cancelled: "was cancelled",
};
const STALL_TICKS_PER_WINDOW = 4;

export interface ManageWorkerOptions {
  readonly run: RunWorker;
  readonly defaultRuntimeId: string;
  readonly runtimes?: readonly RuntimeProfile[];
  readonly timeoutMs?: number;
  readonly stallMs?: number;
  readonly retry?: RetryPolicy;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly inspect?: (taskId: string, cwd: string) => Promise<AttemptInspection>;
  readonly onTrace?: (trace: WorkerTrace) => void;
}

function linkedController(signal: AbortSignal): AbortController {
  const controller = new AbortController();
  if (signal.aborted) controller.abort();
  signal.addEventListener("abort", () => controller.abort(), { once: true });
  return controller;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

class StatusTrail {
  private current: WorkerStatus = "created";
  readonly statuses: WorkerStatus[] = ["created"];

  to(next: WorkerStatus): void {
    const moved = transitionWorker(this.current, next);
    if (!moved.ok) throw new Error(moved.reason);
    this.current = moved.status;
    this.statuses.push(moved.status);
  }
}

interface AttemptResult {
  readonly outcome: WorkerOutcome;
  readonly stoppedBy: StopReason | null;
  readonly statuses: readonly WorkerStatus[];
}

async function runGuarded(
  input: WorkerInput,
  options: ManageWorkerOptions,
  trail: StatusTrail,
): Promise<{ outcome: WorkerOutcome; stoppedBy: StopReason | null }> {
  const now = options.now ?? Date.now;
  const controller = linkedController(input.signal);
  const heartbeat = watchHeartbeat({ ledger: input.ledger, taskId: input.task.id, now });
  let stoppedBy: StopReason | null = null;

  const deadline =
    options.timeoutMs === undefined
      ? null
      : setTimeout(() => {
          stoppedBy = "timeout";
          controller.abort();
        }, options.timeoutMs);

  const stallWindowMs = options.stallMs;
  const stallCheck =
    stallWindowMs === undefined
      ? null
      : setInterval(
          () => {
            if (heartbeat.silentMs(now()) < stallWindowMs) return;
            stoppedBy = "stalled";
            controller.abort();
          },
          Math.max(MIN_STALL_TICK_MS, Math.floor(stallWindowMs / STALL_TICKS_PER_WINDOW)),
        );

  let outcome: WorkerOutcome;
  try {
    outcome = await options.run({ ...input, signal: controller.signal });
  } catch (error: unknown) {
    outcome = { status: "failed", error: `worker crashed: ${errorText(error)}` };
  } finally {
    if (deadline !== null) clearTimeout(deadline);
    if (stallCheck !== null) clearInterval(stallCheck);
    heartbeat.stop();
  }

  if (input.signal.aborted) {
    trail.to("cancelled");
    return { outcome: { status: "cancelled", error: "run cancelled" }, stoppedBy: "cancelled" };
  }
  if (stoppedBy !== null) {
    const window = stoppedBy === "timeout" ? options.timeoutMs : options.stallMs;
    trail.to("failed");
    return { outcome: { status: "failed", error: `worker ${STOP_PHRASE[stoppedBy]} after ${window}ms` }, stoppedBy };
  }
  trail.to(outcome.status === "ok" ? "completed" : outcome.status === "cancelled" ? "cancelled" : "failed");
  return { outcome, stoppedBy: null };
}

async function attemptOnce(input: WorkerInput, options: ManageWorkerOptions): Promise<AttemptResult> {
  const trail = new StatusTrail();
  trail.to("starting");
  trail.to("running");
  const guarded = await runGuarded(input, options, trail);
  return { outcome: guarded.outcome, stoppedBy: guarded.stoppedBy, statuses: trail.statuses };
}

export function manageWorker(options: ManageWorkerOptions): RunWorker {
  const retry = options.retry ?? DEFAULT_RETRY;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  return async (input) => {
    const choice = chooseRuntime(input.task, options.runtimes ?? [], options.defaultRuntimeId);
    const attempts: WorkerAttempt[] = [];
    let outcome: WorkerOutcome = { status: "failed", error: "the worker never ran" };

    for (let attempt = 1; ; attempt += 1) {
      const result = await attemptOnce(input, options);
      outcome = result.outcome;
      const willRetry = !input.signal.aborted && shouldRetry(retry, outcome, attempt);
      const inspection = willRetry && options.inspect ? await options.inspect(input.task.id, input.task.cwd) : null;
      attempts.push({
        attempt,
        workerId: `${input.task.id}#${attempt}`,
        runtimeId: choice.runtimeId,
        statuses: result.statuses,
        status: outcome.status,
        stoppedBy: result.stoppedBy,
        reason: outcome.error ?? null,
        inspection,
      });
      if (!willRetry) break;
      const backoff = backoffFor(retry, attempt);
      if (backoff > 0) await sleep(backoff);
    }

    options.onTrace?.({ taskId: input.task.id, choice, attempts });
    return outcome;
  };
}
