import type { VerificationRung } from "@weave/protocol";
import type { PlannedTask } from "../planner/index.ts";
import { hasPairwiseDisjointPaths } from "./overlap.ts";
import type { DecideInput, Decision, DecisionReason } from "./types.ts";

const MIN_PARALLEL_TASKS = 3;
const MIN_PARALLEL_COMPONENTS = 2;
const UNCONDITIONAL_RUNG: VerificationRung = "diff-review";

function sequential(reason: DecisionReason): Decision {
  return { mode: "sequential", reason };
}

function parallel(reason: DecisionReason): Decision {
  return { mode: "parallel", reason };
}

function isVerifiable(task: PlannedTask, rungs: readonly VerificationRung[]): boolean {
  if (task.verify !== undefined && task.verifyRung !== undefined) return true;
  return rungs.some((rung) => rung !== UNCONDITIONAL_RUNG);
}

function decideExisting({ tasks, rungs }: DecideInput): Decision {
  if (tasks.length < MIN_PARALLEL_TASKS) return sequential("too-few-tasks");
  if (!tasks.every((task) => isVerifiable(task, rungs))) return sequential("unverifiable-task");
  if (!hasPairwiseDisjointPaths(tasks)) return sequential("overlapping-paths");
  return parallel("disjoint-paths");
}

function decideGreenfield({ tasks, hasContract }: DecideInput): Decision {
  if (!hasContract) return sequential("no-contract");
  const components = new Set(tasks.flatMap((task) => (task.component ? [task.component] : [])));
  if (components.size < MIN_PARALLEL_COMPONENTS) return sequential("single-component");
  return parallel("components-with-contract");
}

export function decide(input: DecideInput): Decision {
  if (input.tasks.length <= 1) return sequential("single-task");
  return input.kind === "greenfield" ? decideGreenfield(input) : decideExisting(input);
}
