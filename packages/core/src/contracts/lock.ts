import { CONTRACT_GLOB } from "./constants.ts";

export function lockContract<T extends { readOnlyPaths?: string[] }>(tasks: readonly T[]): T[] {
  return tasks.map((task) => ({
    ...task,
    readOnlyPaths: [...new Set([...(task.readOnlyPaths ?? []), CONTRACT_GLOB])],
  }));
}
