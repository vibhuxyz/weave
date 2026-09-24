import type { PlannedTask } from "@weave/core";
import type { SimTask } from "./types.ts";

const PROMPT_BYTES_PER_UNIT = 200;

export function plannedTasks(tasks: readonly SimTask[]): readonly PlannedTask[] {
  return tasks.map((task) => {
    const brief = `Implement ${task.kind} change ${task.id}. `;
    return {
      id: task.id,
      title: `${task.kind} ${task.id}`,
      component: task.kind,
      prompt: brief.padEnd(task.sizeUnits * PROMPT_BYTES_PER_UNIT - 1, "."),
      cwd: "",
      allowedPaths: [`${task.directory}/**`],
      dependencies: task.dependsOn.map((dependency) => ({ task: dependency, requiredOutputs: [] })),
    };
  });
}
