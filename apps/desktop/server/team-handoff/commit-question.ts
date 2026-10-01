import type { TeamHandoff } from "@weave/core";
import { MAX_LISTED_UNCOMMITTED } from "./constants.ts";

export function commitQuestion(handoff: TeamHandoff, uncommitted: readonly string[]): string {
  const listed = uncommitted.slice(0, MAX_LISTED_UNCOMMITTED).map((path) => path.replace(/\s+/g, " ")).join(", ");
  const more = uncommitted.length > MAX_LISTED_UNCOMMITTED ? ` (+${uncommitted.length - MAX_LISTED_UNCOMMITTED} more)` : "";
  return `The agent started this and wants a team to finish it: ${handoff.reason} Workers start from the last commit, so Weave first commits the ${uncommitted.length} uncommitted file(s): ${listed}${more}.`;
}
