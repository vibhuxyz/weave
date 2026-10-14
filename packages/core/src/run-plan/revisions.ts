import type { TaskContract } from "@weave/protocol";
import type { PoolReport } from "../pool/index.ts";
import { MAX_CONTRACT_REVISIONS } from "./constants.ts";
import type { Reviser } from "./types.ts";

export type RunRound = (tasks: readonly TaskContract[], baseCommit: string, attempt: number) => Promise<PoolReport>;

export interface RevisionLoopInput {
  readonly tasks: readonly TaskContract[];
  readonly baseCommit: string;
  readonly runRound: RunRound;
  readonly revise: Reviser | undefined;
  readonly signal: AbortSignal | undefined;
}

function dependenciesWithin(tasks: readonly TaskContract[]): readonly TaskContract[] {
  const ids = new Set(tasks.map((task) => task.id));
  return tasks.map((task) => ({ ...task, dependencies: task.dependencies?.filter((dependency) => ids.has(dependency.task)) }));
}

function mergeContracts(current: readonly TaskContract[] | undefined, rerun: readonly TaskContract[] | undefined): readonly TaskContract[] | undefined {
  if (!current) return rerun;
  if (!rerun) return current;
  const replaced = new Map(rerun.map((task) => [task.id, task]));
  const merged = current.map((task) => replaced.get(task.id) ?? task);
  const known = new Set(merged.map((task) => task.id));
  return [...merged, ...rerun.filter((task) => !known.has(task.id))];
}

function replaceReports(pool: PoolReport, rerun: PoolReport): PoolReport {
  const rerunById = new Map(rerun.tasks.map((entry) => [entry.taskId, entry]));
  const contracts = mergeContracts(pool.contracts, rerun.contracts);
  return {
    tasks: pool.tasks.map((entry) => rerunById.get(entry.taskId) ?? entry),
    coordination: {
      addedDependencies: [...pool.coordination.addedDependencies, ...rerun.coordination.addedDependencies],
      escalations: [...pool.coordination.escalations, ...rerun.coordination.escalations],
    },
    ...(contracts ? { contracts } : {}),
  };
}

export async function runWithRevisions(input: RevisionLoopInput): Promise<{ pool: PoolReport; baseCommit: string }> {
  let pool = await input.runRound(input.tasks, input.baseCommit, 0);
  let baseCommit = input.baseCommit;
  let freshTaskIds: ReadonlySet<string> = new Set(input.tasks.map((task) => task.id));
  for (let round = 1; round <= MAX_CONTRACT_REVISIONS && input.revise && !input.signal?.aborted; round += 1) {
    const revision = await input.revise({ pool, baseCommit, round, freshTaskIds });
    if (!revision) break;
    baseCommit = revision.baseCommit;
    if (revision.rerun.length === 0) break;
    const rerun = await input.runRound(dependenciesWithin(revision.rerun), baseCommit, round);
    pool = replaceReports(pool, rerun);
    freshTaskIds = new Set(revision.rerun.map((task) => task.id));
  }
  return { pool, baseCommit };
}
