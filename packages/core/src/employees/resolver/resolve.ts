import type { EmployeeRegistry } from "../registry/index.ts";
import { scoreEmployee } from "./score.ts";
import type { AssignableTask, Candidate, Resolution, ResolveOptions } from "./types.ts";

export const MIN_ASSIGNMENT_SCORE = 2;
const LISTED_CANDIDATES = 5;

function ranked(candidates: readonly Candidate[]): readonly Candidate[] {
  return [...candidates].sort((a, b) => b.score - a.score || a.employee.id.localeCompare(b.employee.id));
}

export function resolveEmployee(task: AssignableTask, registry: EmployeeRegistry, options: ResolveOptions): Resolution {
  const candidates = ranked(registry.employees.map((employee) => scoreEmployee(employee, task, options)));
  const eligible = candidates.filter((candidate) => candidate.blockers.length === 0);
  const listed = candidates.slice(0, LISTED_CANDIDATES);
  const requested = task.employee ? candidates.find((candidate) => candidate.employee.id === task.employee) : undefined;
  if (requested && requested.blockers.length === 0) {
    return { taskId: task.id, chosen: { ...requested, reasons: ["requested by the plan", ...requested.reasons] }, candidates: listed, reason: `plan asked for ${requested.employee.id}` };
  }
  const refusal = task.employee ? (requested ? `${task.employee} cannot take it (${requested.blockers.join("; ")}); ` : `no employee ${task.employee}; `) : "";
  const best = eligible[0];
  if (!best || best.score < MIN_ASSIGNMENT_SCORE) {
    return { taskId: task.id, chosen: null, candidates: listed, reason: `${refusal}no employee matches well enough (best ${best?.employee.id ?? "none"} scored ${best?.score.toFixed(1) ?? 0})` };
  }
  return { taskId: task.id, chosen: best, candidates: listed, reason: `${refusal}${best.employee.id}: ${best.reasons.join("; ")}` };
}
