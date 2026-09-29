import type { WorkerOutcome } from "../pool/index.ts";
import type { RetryPolicy } from "./types.ts";

const RETRYABLE_REASON = /\b(timed out|stalled|crashed|ECONNRESET|ETIMEDOUT|overloaded|rate.?limit)\b/i;

export const DEFAULT_RETRY: RetryPolicy = { maxAttempts: 1, backoffMs: 0 };

export function isRetryableOutcome(outcome: WorkerOutcome): boolean {
  if (outcome.status !== "failed") return false;
  return RETRYABLE_REASON.test(outcome.error ?? "");
}

export function shouldRetry(policy: RetryPolicy, outcome: WorkerOutcome, attempt: number): boolean {
  if (attempt >= policy.maxAttempts) return false;
  return (policy.isRetryable ?? isRetryableOutcome)(outcome);
}

export function backoffFor(policy: RetryPolicy, attempt: number): number {
  return policy.backoffMs * 2 ** (attempt - 1);
}
