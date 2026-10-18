import type { PlannedTask } from "../../../planner/index.ts";
import { rejectionEvent } from "../../../planner/index.ts";
import type { Reviser } from "../../../run-plan/index.ts";
import type { Ledger } from "../../../shared/index.ts";
import { DIRECT_TASK_ID, FIRST_WORKER_FAILED_REASON, FOLLOW_UP_ROUND } from "../constants.ts";
import { withFirstWorkerReport } from "./tasks.ts";

export interface FollowUpSource {
  readonly ledger: Ledger;
  readonly pending: () => Promise<void>;
  readonly staged: () => readonly PlannedTask[] | null;
}

export function followUpReviser(source: FollowUpSource): Reviser {
  return async ({ pool, baseCommit, round }) => {
    if (round !== FOLLOW_UP_ROUND) return null;
    await source.pending();
    const tasks = source.staged();
    if (!tasks || tasks.length === 0) return null;
    const direct = pool.tasks.find((entry) => entry.taskId === DIRECT_TASK_ID);
    if (direct?.status !== "ok") {
      source.ledger.append("plan.rejected", rejectionEvent([FIRST_WORKER_FAILED_REASON], false));
      return null;
    }
    const rerun = tasks.map((task) => withFirstWorkerReport(task, direct.finalMessage));
    return { baseCommit: direct.harvest?.commit ?? baseCommit, rerun };
  };
}
