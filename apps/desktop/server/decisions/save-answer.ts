import type { ServerMessage } from "../shared/index.ts";
import type { DecisionLog, NewDecision } from "./decision-log.ts";

export function saveAnswer(
  decisions: DecisionLog,
  decision: NewDecision,
  send: (msg: ServerMessage) => void,
): void {
  const saved = decisions.record(decision);
  if (saved.ok) return;
  send({
    type: "error",
    message: `Your answer reached the agent, but Weave could not save it for later runs: ${saved.reason}`,
  });
}
