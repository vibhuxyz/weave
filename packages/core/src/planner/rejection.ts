import { flatten } from "../shared/index.ts";

const MAX_REASONS = 8;
const MAX_REASON_CHARS = 300;

export function rejectionEvent(reasons: readonly string[], willRepair: boolean): { reasons: string[]; willRepair: boolean } {
  return {
    reasons: reasons.slice(0, MAX_REASONS).map((reason) => flatten(reason).slice(0, MAX_REASON_CHARS)),
    willRepair,
  };
}
