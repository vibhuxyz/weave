import type { VerificationRung } from "@weave/protocol";
import { concurrentWriteConflicts } from "./concurrent-writes.ts";
import type { PlanReview, PlanValidationContext, ReviewedTask } from "./types.ts";

const MAX_LISTED_NAMES = 12;
const ALWAYS_AVAILABLE_RUNG: VerificationRung = "diff-review";

function listed(names: readonly string[]): string {
  const shown = names.slice(0, MAX_LISTED_NAMES).join(", ");
  return names.length > MAX_LISTED_NAMES ? `${shown} (+${names.length - MAX_LISTED_NAMES} more)` : shown;
}

function unknownEmployees(tasks: readonly ReviewedTask[], employeeIds: readonly string[] | null): readonly string[] {
  if (employeeIds === null) return [];
  const known = new Set(employeeIds);
  return tasks.flatMap((task) => task.employee === undefined || known.has(task.employee)
    ? []
    : [`Task ${task.id} names employee "${task.employee}", which is not on the roster (${listed([...employeeIds].sort()) || "empty"}); pick one from the roster or leave "employee" out`]);
}

function unknownEngines(tasks: readonly ReviewedTask[], engineIds: readonly string[] | null): readonly string[] {
  if (engineIds === null) return [];
  const known = new Set(engineIds);
  return tasks.flatMap((task) => task.engine === undefined || known.has(task.engine)
    ? []
    : [`Task ${task.id} names engine "${task.engine}", which is not installed for this run (installed: ${listed([...engineIds].sort()) || "none"}); pick one of those or leave "engine" out`]);
}

function unsupportedRungs(tasks: readonly ReviewedTask[], supported: readonly VerificationRung[] | null): readonly string[] {
  if (supported === null) return [];
  return tasks.flatMap((task) => task.verifyRung === undefined || supported.includes(task.verifyRung)
    ? []
    : [`Task ${task.id} verifies with "${task.verifyRung}", which this project cannot run (supported: ${listed(supported) || "none"})`]);
}

function unknownSkills(tasks: readonly ReviewedTask[], skillNames: readonly string[] | null): readonly string[] {
  if (skillNames === null) return [];
  const known = new Set(skillNames.map((name) => name.toLowerCase()));
  return tasks.flatMap((task) => {
    const missing = (task.skills ?? []).filter((name) => !known.has(name.toLowerCase()));
    return missing.length === 0 ? [] : [`Task ${task.id} asks for skills not in the catalog: ${listed(missing)}`];
  });
}

function missingVerification(tasks: readonly ReviewedTask[], supported: readonly VerificationRung[] | null): readonly string[] {
  const runnable = (supported ?? []).filter((rung) => rung !== ALWAYS_AVAILABLE_RUNG);
  if (runnable.length === 0 || tasks.some((task) => task.verifyRung !== undefined)) return [];
  return [`No task names a verification step, although the project supports: ${listed(runnable)}`];
}

function tasksWithoutMilestones(tasks: readonly ReviewedTask[]): readonly string[] {
  const silent = tasks.filter((task) => (task.subtasks ?? []).length === 0).map((task) => task.id);
  return silent.length === 0 ? [] : [`No milestones to report progress against in: ${listed(silent)}; those workers only report when they finish`];
}

function undeclaredOutputs(tasks: readonly ReviewedTask[]): readonly string[] {
  const producedBy = new Map(tasks.map((task) => [task.id, new Set(task.produces ?? [])]));
  return tasks.flatMap((task) =>
    (task.dependencies ?? []).flatMap((dependency) => {
      const produced = producedBy.get(dependency.task);
      if (produced === undefined) return [];
      const missing = dependency.requiredOutputs.filter((output) => !produced.has(output));
      if (missing.length === 0) return [];
      return [`Task ${task.id} waits for ${listed(missing)} from ${dependency.task}, but ${dependency.task} does not list ${missing.length === 1 ? "it" : "them"} in "produces" (it produces: ${listed([...produced].sort()) || "nothing"}); add the missing names to ${dependency.task}'s "produces" or drop them from ${task.id}'s "requiredOutputs"`];
    }),
  );
}

function outputsWithoutProducer(tasks: readonly ReviewedTask[]): readonly string[] {
  const dependents = new Map<string, number>();
  for (const task of tasks) for (const dependency of task.dependencies ?? []) dependents.set(dependency.task, (dependents.get(dependency.task) ?? 0) + 1);
  const silent = tasks.filter((task) => (dependents.get(task.id) ?? 0) > 0 && (task.produces ?? []).length === 0);
  return silent.map((task) => `Task ${task.id} has dependents but lists no "produces", so nothing can start before it finishes`);
}

export function validatePlan(tasks: readonly ReviewedTask[], context: PlanValidationContext): PlanReview {
  return {
    errors: [...concurrentWriteConflicts(tasks), ...unknownEmployees(tasks, context.employeeIds), ...unknownEngines(tasks, context.engineIds), ...unsupportedRungs(tasks, context.supportedRungs), ...undeclaredOutputs(tasks)],
    warnings: [...unknownSkills(tasks, context.skillNames), ...missingVerification(tasks, context.supportedRungs), ...outputsWithoutProducer(tasks), ...tasksWithoutMilestones(tasks)],
  };
}
