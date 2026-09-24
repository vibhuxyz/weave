import type { RunOutcome } from "../../../../server/index.ts";

export function outcomeText(outcome: RunOutcome): string {
  switch (outcome.status) {
    case "ran":
      return outcome.branch ? `Finished: ${outcome.result}, merged on ${outcome.branch}` : `Finished: ${outcome.result}`;
    case "refused":
      return `Refused: ${outcome.reason}`;
    case "no-change-needed":
      return `No change needed: ${outcome.reason}`;
    case "error":
      return outcome.reason;
    default: {
      const unreachable: never = outcome;
      return unreachable;
    }
  }
}
