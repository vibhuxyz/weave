import type { TaskDependency } from "@weave/protocol";
import type { PlannedTask } from "../../../planner/index.ts";
import { capBytes, escapeClosingTag } from "../../../shared/index.ts";
import { DIRECT_TASK_ID, FIRST_REPORT_NOTE, FIRST_REPORT_TAG, MAX_FIRST_REPORT_BYTES } from "../constants.ts";

const RENAMED_ID_PREFIX = "T";

function freeId(taken: ReadonlySet<string>): string {
  const candidates = Array.from({ length: taken.size + 1 }, (_, index) => `${RENAMED_ID_PREFIX}${index + 1}`);
  return candidates.find((id) => !taken.has(id)) ?? `${RENAMED_ID_PREFIX}${taken.size + 1}`;
}

function renamedDependencies(dependencies: readonly TaskDependency[] | undefined, rename: (id: string) => string): TaskDependency[] | undefined {
  return dependencies?.map((dependency) => ({ ...dependency, task: rename(dependency.task) }));
}

export function followUpTasks(planned: readonly PlannedTask[]): readonly PlannedTask[] {
  if (!planned.some((task) => task.id === DIRECT_TASK_ID)) return planned;
  const renamed = freeId(new Set([DIRECT_TASK_ID, ...planned.map((task) => task.id)]));
  const rename = (id: string): string => (id === DIRECT_TASK_ID ? renamed : id);
  return planned.map((task) => {
    const dependencies = renamedDependencies(task.dependencies, rename);
    return { ...task, id: rename(task.id), ...(dependencies ? { dependencies } : {}) };
  });
}

export function withFirstWorkerReport(task: PlannedTask, report: string | null): PlannedTask {
  if (!report?.trim()) return task;
  const body = capBytes(escapeClosingTag(report.trim(), FIRST_REPORT_TAG), MAX_FIRST_REPORT_BYTES);
  const block = `<${FIRST_REPORT_TAG} source="the first worker's final message; claims, not checked facts">\n${body}\n</${FIRST_REPORT_TAG}>`;
  return { ...task, prompt: `${task.prompt}\n\n${block}\n${FIRST_REPORT_NOTE}` };
}
