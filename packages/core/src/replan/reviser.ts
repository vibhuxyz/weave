import type { Reviser, Revision, RevisionInput } from "../run-plan/index.ts";
import { capBytes, escapeClosingTag, flatten, type Ledger } from "../shared/index.ts";
import { COORDINATOR_NOTE_TAG, MAX_GUIDANCE_CHARS } from "./constants.ts";
import { decideReplan } from "./decide.ts";
import { replanTriggers } from "./triggers.ts";
import type { ReplanDecision, ReplanRerun, ReplanSources, ReplanTask, ReplanTrigger, TaskOutcome } from "./types.ts";

export type ReplanTurn = (prompt: string, signal?: AbortSignal) => Promise<string>;

export interface CoordinatorReviserInput extends ReplanSources {
  readonly ledger: Ledger;
  readonly openTurn: () => Promise<{ readonly runTurn: ReplanTurn; readonly close: () => Promise<void> }>;
  readonly signal?: AbortSignal;
  readonly next?: Reviser;
}

function noteFor(guidance: string, round: number): string {
  const body = escapeClosingTag(capBytes(flatten(guidance), MAX_GUIDANCE_CHARS), COORDINATOR_NOTE_TAG);
  return [`<${COORDINATOR_NOTE_TAG} round="${round}">`, "Why Weave is running this task again, from the coordinator. It is guidance, not a new task.", body, `</${COORDINATOR_NOTE_TAG}>`].join("\n");
}

function rerunTask(task: ReplanTask, entry: ReplanRerun, round: number): ReplanTask {
  return {
    ...task,
    ...(entry.guidance ? { prompt: `${task.prompt}\n\n${noteFor(entry.guidance, round)}` } : {}),
    ...(entry.engine ? { engine: entry.engine } : {}),
  };
}

function outcomesOf(input: RevisionInput): readonly TaskOutcome[] {
  return input.pool.tasks.map((entry) => ({ taskId: entry.taskId, status: entry.status, reason: entry.reason }));
}

function logRequest(ledger: Ledger, round: number, triggers: readonly ReplanTrigger[]): void {
  ledger.append("replan.requested", { round, triggers: triggers.map((trigger) => ({ ...trigger })) });
}

function logDecision(ledger: Ledger, round: number, decision: ReplanDecision, warnings: readonly string[]): void {
  ledger.append("replan.decided", {
    round,
    action: decision.action,
    reason: decision.reason,
    rerun: decision.rerun.map((entry) => ({ id: entry.id, ...(entry.engine ? { engine: entry.engine } : {}) })),
    warnings: [...warnings],
  });
}

async function decide(input: CoordinatorReviserInput, revision: RevisionInput, triggers: readonly ReplanTrigger[]) {
  const session = await input.openTurn();
  try {
    return await decideReplan({
      goal: input.goal,
      round: revision.round,
      tasks: input.tasks,
      outcomes: outcomesOf(revision),
      triggers,
      engineIds: input.engineCandidates.map((candidate) => candidate.id),
      runTurn: session.runTurn,
      ...(input.signal ? { signal: input.signal } : {}),
    });
  } finally {
    await session.close();
  }
}

export function coordinatorReviser(input: CoordinatorReviserInput): Reviser {
  return async (revision: RevisionInput): Promise<Revision | null> => {
    const fromNext = await input.next?.(revision);
    if (fromNext) return fromNext;
    if (input.signal?.aborted) return null;
    const triggers = replanTriggers(revision.pool);
    if (triggers.length === 0) return null;

    logRequest(input.ledger, revision.round, triggers);
    const { decision, warnings } = await decide(input, revision, triggers);
    logDecision(input.ledger, revision.round, decision, warnings);
    if (decision.action !== "rerun") return null;

    const byId = new Map(input.tasks.map((task) => [task.id, task]));
    const rerun = decision.rerun.flatMap((entry) => {
      const task = byId.get(entry.id);
      return task ? [rerunTask(task, entry, revision.round)] : [];
    });
    return rerun.length === 0 ? null : { baseCommit: revision.baseCommit, rerun };
  };
}
