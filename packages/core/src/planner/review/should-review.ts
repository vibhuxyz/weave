import { MIN_TASKS_FOR_REVIEW, REVIEWED_RISK, REVIEWED_SCOPES } from "./constants.ts";
import type { ReviewGateInput } from "./types.ts";

export function shouldReview(input: ReviewGateInput): boolean {
  if (input.risk === REVIEWED_RISK) return true;
  if (REVIEWED_SCOPES.some((scope) => scope === input.scope)) return true;
  return input.taskCount >= MIN_TASKS_FOR_REVIEW;
}
