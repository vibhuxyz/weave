import type { TaskContract } from "@weave/protocol";
import { topologicalOrder } from "../../scheduler/index.ts";

type GraphTask = Pick<TaskContract, "id" | "dependencies">;

export interface InvalidateInput {
  readonly tasks: readonly GraphTask[];
  readonly isOk: (taskId: string) => boolean;
  readonly staleReasons: ReadonlyMap<string, string>;
}

function brokenProducer(task: GraphTask, isValid: (taskId: string) => boolean): string | null {
  return (task.dependencies ?? []).find((dependency) => !isValid(dependency.task))?.task ?? null;
}

export function invalidatedConsumers(input: InvalidateInput): ReadonlyMap<string, string> {
  const reasons = new Map<string, string>();
  const tasksById = new Map(input.tasks.map((task) => [task.id, task]));
  const isValid = (taskId: string): boolean => input.isOk(taskId) && !reasons.has(taskId);
  for (const taskId of topologicalOrder(input.tasks)) {
    const task = tasksById.get(taskId);
    if (!task || !input.isOk(taskId)) continue;
    const stale = input.staleReasons.get(taskId);
    const producer = brokenProducer(task, isValid);
    if (stale) reasons.set(taskId, stale);
    else if (producer) reasons.set(taskId, `consumed work from ${producer}, which did not finish ok`);
  }
  return reasons;
}

export interface StaleInput {
  readonly consumed: ReadonlyMap<string, ReadonlyMap<string, number>>;
  readonly latestVersion: (key: string) => number;
}

export function staleConsumers(input: StaleInput): ReadonlyMap<string, string> {
  const reasons = new Map<string, string>();
  for (const [consumer, versions] of [...input.consumed.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const outdated = [...versions.entries()]
      .filter(([key, version]) => input.latestVersion(key) > version)
      .map(([key, version]) => `${key} v${version} (latest v${input.latestVersion(key)})`)
      .sort();
    if (outdated.length > 0) reasons.set(consumer, `built against an outdated artifact: ${outdated.join(", ")}`);
  }
  return reasons;
}
