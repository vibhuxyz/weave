import type { TaskContract } from "@weave/protocol";
import { publishedOutputKey } from "../scheduler/index.ts";
import type { PoolContext, PoolTaskReport } from "./types.ts";

export const TRANSIENT_DELAYS_MS = [5_000, 20_000] as const;
export const MAX_TRANSIENT_RETRIES = TRANSIENT_DELAYS_MS.length;
export const MAX_PUBLISH_RETRIES = 1;
const PUBLISH_DELAY_MS = 5_000;
const MAX_NOTE_CHARS = 300;

const TRANSIENT_FAILURE = /timeout|timed out|stall|crash|econnreset|econnrefused|socket hang up|overloaded|rate limit|\b429\b|\b502\b|\b503\b|\b504\b|network/i;
const PERMANENT_FAILURE = /verify|rejected|scope|allowed path|outside|permission|invalid plan/i;

export interface RetryCounts {
  transient: number;
  publish: number;
}

export type RetryDecision =
  | { readonly action: "settle" }
  | { readonly action: "retry"; readonly kind: "transient" | "publish"; readonly delayMs: number; readonly reason: string; readonly note: string };

export function isTransientFailure(reason: string | null): boolean {
  const text = reason ?? "";
  if (PERMANENT_FAILURE.test(text)) return false;
  return TRANSIENT_FAILURE.test(text);
}

export function missingOutputs(taskId: string, ctx: PoolContext): readonly string[] {
  const published = ctx.coordinator.publishedKeys();
  const names = new Set<string>();
  for (const task of ctx.coordinator.tasks()) {
    for (const dependency of task.dependencies ?? []) {
      if (dependency.task !== taskId) continue;
      for (const output of dependency.requiredOutputs) {
        if (!published.has(publishedOutputKey(taskId, output))) names.add(output);
      }
    }
  }
  return [...names].sort();
}

export function decideRetry(report: PoolTaskReport, counts: RetryCounts, missing: readonly string[]): RetryDecision {
  if (report.status === "cancelled" || report.isRejected) return { action: "settle" };
  if (report.status === "failed" && isTransientFailure(report.reason) && counts.transient < MAX_TRANSIENT_RETRIES) {
    const delayMs = TRANSIENT_DELAYS_MS[counts.transient] ?? PUBLISH_DELAY_MS;
    const reason = clip(report.reason ?? "the worker failed");
    return { action: "retry", kind: "transient", delayMs, reason, note: `The previous attempt failed: ${reason}. Continue the same task.` };
  }
  if (report.status === "ok" && missing.length > 0 && counts.publish < MAX_PUBLISH_RETRIES) {
    const listed = missing.join(", ");
    return {
      action: "retry",
      kind: "publish",
      delayMs: PUBLISH_DELAY_MS,
      reason: `finished without publishing ${listed}`,
      note: `You must publish ${listed} before you finish.`,
    };
  }
  return { action: "settle" };
}

export function notedTask(task: TaskContract, note: string): TaskContract {
  if (note === "") return task;
  return { ...task, prompt: `${task.prompt}\n\n${note}` };
}

export function delay(ms: number, signal: AbortSignal): Promise<void> {
  if (ms === 0 || signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
  });
}

function clip(text: string): string {
  return text.length <= MAX_NOTE_CHARS ? text : `${text.slice(0, MAX_NOTE_CHARS)}…`;
}
