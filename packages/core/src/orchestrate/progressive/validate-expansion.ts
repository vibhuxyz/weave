import { describedPlanIssues, type PlannedTask } from "../../planner/index.ts";
import { DIRECT_TASK_ID } from "./constants.ts";

const MAX_ISSUES = 20;

function missingProduces(tasks: readonly PlannedTask[]): readonly string[] {
  return tasks.flatMap((task) => (task.dependencies ?? []).flatMap((dependency) => {
    const producer = tasks.find((candidate) => candidate.id === dependency.task);
    return dependency.requiredOutputs.filter((output) => !producer?.produces?.includes(output)).map((output) => `${task.id} needs ${output} from ${dependency.task}`);
  }));
}

export function validateExpansion(tasks: readonly PlannedTask[]): { readonly ok: true } | { readonly ok: false; readonly reasons: readonly string[] } {
  const direct = tasks.find((task) => task.id === DIRECT_TASK_ID);
  const reasons = [
    ...(direct && (direct.allowedPaths ?? []).length === 0 ? ["the running worker has no owned paths to protect"] : []),
    ...tasks.filter((task) => task.id !== DIRECT_TASK_ID && (task.allowedPaths ?? []).length === 0).map((task) => `${task.id} has no owned paths`),
    ...describedPlanIssues(tasks),
    ...missingProduces(tasks),
  ].slice(0, MAX_ISSUES);
  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}
