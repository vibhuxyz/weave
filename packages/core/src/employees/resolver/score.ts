import { wordsOf } from "../../context/index.ts";
import type { Employee } from "../model/index.ts";
import type { AssignableTask, Candidate, EmployeePerformance, ResolveOptions } from "./types.ts";
import { isUnrestricted, isWriteCovered } from "./write-scope.ts";

const COMPONENT_WEIGHT = 4;
const RESPONSIBILITY_WEIGHT = 2;
const SKILL_WEIGHT = 1;
const FOCUSED_SCOPE_WEIGHT = 3;
const PERFORMANCE_WEIGHT = 2;
const MIN_PERFORMANCE_SAMPLES = 5;
const NEUTRAL_SUCCESS = 0.5;

function taskWords(task: AssignableTask): ReadonlySet<string> {
  return new Set(wordsOf([task.title ?? "", task.prompt, ...(task.allowedPaths ?? [])].join(" ")));
}

function phraseMatches(phrases: readonly string[], words: ReadonlySet<string>): readonly string[] {
  return phrases.filter((phrase) => {
    const needed = wordsOf(phrase);
    return needed.length > 0 && needed.every((word) => words.has(word));
  });
}

function blockersFor(employee: Employee, task: AssignableTask, options: ResolveOptions): readonly string[] {
  const outside = (task.allowedPaths ?? []).filter((path) => !isWriteCovered(path, employee.permissions.filesystem.write));
  const allowed = employee.engines.allowed;
  const hasEngine = allowed === null || options.configuredEngines.some((engineId) => allowed.includes(engineId));
  return [
    ...(outside.length > 0 ? [`may not write ${outside.join(", ")}`] : []),
    ...(hasEngine ? [] : [`none of its allowed engines (${allowed?.join(", ")}) is configured`]),
  ];
}

function performanceBonus(performance: EmployeePerformance | undefined): { readonly score: number; readonly reason: string | null } {
  if (!performance || performance.tasks < MIN_PERFORMANCE_SAMPLES) return { score: 0, reason: null };
  const successRate = performance.ok / performance.tasks;
  return { score: PERFORMANCE_WEIGHT * (successRate - NEUTRAL_SUCCESS) * 2, reason: `${performance.ok}/${performance.tasks} past tasks ok` };
}

export function scoreEmployee(employee: Employee, task: AssignableTask, options: ResolveOptions): Candidate {
  const words = taskWords(task);
  const component = task.component ? wordsOf(task.component) : [];
  const identity = new Set(wordsOf([employee.id, ...employee.responsibilities].join(" ")));
  const isComponentMatch = component.length > 0 && component.every((word) => identity.has(word));
  const responsibilities = phraseMatches(employee.responsibilities, words);
  const skills = phraseMatches(employee.skills, words);
  const write = employee.permissions.filesystem.write;
  const isFocused = !isUnrestricted(write) && (task.allowedPaths ?? []).length > 0 && (task.allowedPaths ?? []).every((path) => isWriteCovered(path, write));
  const performance = performanceBonus(options.performance?.get(employee.id));
  const score = (isComponentMatch ? COMPONENT_WEIGHT : 0) + RESPONSIBILITY_WEIGHT * responsibilities.length + SKILL_WEIGHT * skills.length + (isFocused ? FOCUSED_SCOPE_WEIGHT : 0) + performance.score;
  const reasons = [
    ...(isComponentMatch ? [`component ${task.component}`] : []),
    ...(responsibilities.length > 0 ? [`responsible for ${responsibilities.join(", ")}`] : []),
    ...(skills.length > 0 ? [`skills ${skills.join(", ")}`] : []),
    ...(isFocused ? ["write permission is scoped to exactly this area"] : []),
    ...(performance.reason ? [performance.reason] : []),
  ];
  return { employee, score, reasons, blockers: blockersFor(employee, task, options) };
}
