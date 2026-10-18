import { briefingsFromHandoff, judgeHandoff, renderHandoffNotes, tasksFromHandoff, TEAM_HANDOFF_PROMPT_VERSION, type HandoffVerdict, type Ledger, type TeamHandoff, type WorktreeResult } from "@weave/core";
import type { PromptImageData, ServerMessage } from "../shared/index.ts";
import { describeConflicts, scopeConflicts } from "./handoff-scope.ts";
import type { TeamRunStart } from "./types.ts";

type TeamVerdict = Extract<HandoffVerdict, { kind: "team" }>;
type Outcome = "invalid" | "team" | "commit-failed";

export interface SettleHandoffInput {
  readonly verdict: HandoffVerdict;
  readonly request: string;
  readonly projectDir: string;
  readonly estimateNotes: string;
  readonly images?: readonly PromptImageData[];
  readonly ledger: Ledger;
  readonly send: (message: ServerMessage) => void;
  readonly startTeamRun: (start: TeamRunStart) => void;
  readonly commitWork: () => Promise<WorktreeResult<string>>;
  readonly accepted?: TeamHandoff | null;
}

function requestForWorkers(original: string, handoff: TeamHandoff): string {
  if (handoff.remaining.length === 0) return original;
  const pieces = handoff.remaining.map((item) => `- ${item.work}`);
  return ["Do only the remaining work below. The chat agent already started and is still working on its own files. Do not redo what it finished.", ...pieces].join("\n");
}

function logDecision(ledger: Ledger, outcome: Outcome, detail: string): void {
  ledger.append("handoff.decided", { outcome, detail, promptVersion: TEAM_HANDOFF_PROMPT_VERSION });
}

function reportScopeConflicts(input: SettleHandoffInput, verdict: TeamVerdict): void {
  const conflicts = scopeConflicts(verdict.uncommitted, verdict.handoff);
  if (conflicts.length === 0) return;
  for (const conflict of conflicts) {
    input.ledger.append("error", { taskId: "desktop", where: "handoff.scope", message: `${conflict.path} is still open in this chat and belongs to worker ${conflict.takenBy}` });
  }
  input.send({ type: "error", message: describeConflicts(conflicts) });
}

async function isReadyToStart(input: SettleHandoffInput, verdict: TeamVerdict): Promise<boolean> {
  if (verdict.uncommitted.length === 0) return true;
  reportScopeConflicts(input, verdict);
  const committed = await input.commitWork();
  if (committed.ok) return true;
  logDecision(input.ledger, "commit-failed", committed.reason);
  input.send({ type: "error", message: `Weave could not commit the work before the team run: ${committed.reason}` });
  return false;
}

export async function releaseToTeam(input: Omit<SettleHandoffInput, "verdict"> & {
  readonly readText: () => string;
  readonly readUncommitted: () => Promise<readonly string[]>;
}): Promise<void> {
  const uncommitted = [...(await input.readUncommitted())].sort();
  const verdict = input.accepted
    ? { kind: "team" as const, handoff: input.accepted, uncommitted }
    : judgeHandoff({ text: input.readText(), uncommitted });
  await settleHandoff({
    verdict,
    request: input.request,
    projectDir: input.projectDir,
    estimateNotes: input.estimateNotes,
    images: input.images,
    ledger: input.ledger,
    send: input.send,
    startTeamRun: input.startTeamRun,
    commitWork: input.commitWork,
  });
}

export async function settleHandoff(input: SettleHandoffInput): Promise<void> {
  const { verdict } = input;
  if (verdict.kind === "none") return;
  if (verdict.kind === "invalid") {
    logDecision(input.ledger, "invalid", verdict.issue);
    input.send({ type: "error", message: `The agent tried to add workers, but ${verdict.issue}. This chat keeps the work.` });
    return;
  }
  if (!(await isReadyToStart(input, verdict))) return;
  logDecision(input.ledger, "team", verdict.handoff.reason);
  const plannerNotes = [renderHandoffNotes(verdict.handoff), input.estimateNotes].filter((notes) => notes !== "").join("\n\n");
  input.startTeamRun({
    request: requestForWorkers(input.request, verdict.handoff),
    routeReason: verdict.handoff.reason,
    plannerNotes,
    presetTasks: tasksFromHandoff(verdict.handoff, input.projectDir),
    briefings: briefingsFromHandoff(verdict.handoff),
    ...(input.images && input.images.length > 0 ? { images: input.images } : {}),
  });
}

export function promptMayHandOff(message: { readonly allowHandoff?: boolean; readonly images?: readonly unknown[] }): boolean {
  return message.allowHandoff === true;
}
