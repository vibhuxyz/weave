import { renderHandoffNotes, TEAM_HANDOFF_PROMPT_VERSION, type HandoffVerdict, type Ledger, type WorktreeResult } from "@weave/core";
import type { ServerMessage } from "../shared/index.ts";
import { commitQuestion } from "./commit-question.ts";
import { KEPT_IN_CHAT_MESSAGE } from "./constants.ts";
import type { TeamRunStart } from "./types.ts";

type TeamVerdict = Extract<HandoffVerdict, { kind: "team" }>;
type Outcome = "invalid" | "team" | "kept-in-chat" | "commit-failed";

export interface SettleHandoffInput {
  readonly verdict: HandoffVerdict;
  readonly request: string;
  readonly estimateNotes: string;
  readonly ledger: Ledger;
  readonly send: (message: ServerMessage) => void;
  readonly startTeamRun: (start: TeamRunStart) => void;
  readonly confirmCommit: (message: string) => Promise<boolean>;
  readonly commitWork: () => Promise<WorktreeResult<string>>;
}

function logDecision(ledger: Ledger, outcome: Outcome, detail: string): void {
  ledger.append("handoff.decided", { outcome, detail, promptVersion: TEAM_HANDOFF_PROMPT_VERSION });
}

async function isReadyToStart(input: SettleHandoffInput, verdict: TeamVerdict): Promise<boolean> {
  if (verdict.uncommitted.length === 0) return true;
  if (!(await input.confirmCommit(commitQuestion(verdict.handoff, verdict.uncommitted)))) {
    logDecision(input.ledger, "kept-in-chat", verdict.handoff.reason);
    input.send({ type: "error", message: KEPT_IN_CHAT_MESSAGE });
    return false;
  }
  const committed = await input.commitWork();
  if (committed.ok) return true;
  logDecision(input.ledger, "commit-failed", committed.reason);
  input.send({ type: "error", message: `Weave could not commit the work before the team run: ${committed.reason}` });
  return false;
}

export async function settleHandoff(input: SettleHandoffInput): Promise<void> {
  const { verdict } = input;
  if (verdict.kind === "none") return;
  if (verdict.kind === "invalid") {
    logDecision(input.ledger, "invalid", verdict.issue);
    input.send({ type: "error", message: `The agent tried to ask a team to finish this, but ${verdict.issue}. It stays in this chat; send it with /parallel to run it with a team.` });
    return;
  }
  if (!(await isReadyToStart(input, verdict))) return;
  logDecision(input.ledger, "team", verdict.handoff.reason);
  const plannerNotes = [renderHandoffNotes(verdict.handoff), input.estimateNotes].filter((notes) => notes !== "").join("\n\n");
  input.startTeamRun({ request: input.request, routeReason: verdict.handoff.reason, plannerNotes });
}
