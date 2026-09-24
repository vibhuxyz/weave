import { integerBetween, pick } from "./rng.ts";
import type { Scenario, ScenarioShape, SimTask, TaskKind } from "./types.ts";

const KINDS: readonly TaskKind[] = ["web", "api", "db"];
const SHAPES: readonly ScenarioShape[] = ["pair", "fan", "chain", "overlap", "diamond"];
const MIN_UNITS = 2;
const MAX_UNITS = 6;
const MAX_FAN_TASKS = 4;

function task(scenarioId: string, index: number, dependsOn: readonly string[], directory?: string): SimTask {
  const id = `T${index + 1}`;
  const kind = pick(KINDS, scenarioId, id, "kind");
  return { id, kind, sizeUnits: integerBetween(MIN_UNITS, MAX_UNITS, scenarioId, id, "size"), dependsOn, directory: directory ?? `${kind}/${id.toLowerCase()}` };
}

function tasksFor(shape: ScenarioShape, scenarioId: string): readonly SimTask[] {
  switch (shape) {
    case "pair":
      return [task(scenarioId, 0, []), task(scenarioId, 1, [])];
    case "fan":
      return Array.from({ length: integerBetween(3, MAX_FAN_TASKS, scenarioId, "fan") }, (_, index) => task(scenarioId, index, []));
    case "chain":
      return [task(scenarioId, 0, []), task(scenarioId, 1, ["T1"]), task(scenarioId, 2, ["T2"])];
    case "overlap":
      return [task(scenarioId, 0, [], "shared"), task(scenarioId, 1, [], "shared"), task(scenarioId, 2, [], "shared")];
    case "diamond":
      return [task(scenarioId, 0, []), task(scenarioId, 1, ["T1"]), task(scenarioId, 2, ["T1"]), task(scenarioId, 3, ["T2", "T3"])];
    default: {
      const unhandled: never = shape;
      return unhandled;
    }
  }
}

export function generateScenarios(prefix: string, count: number): readonly Scenario[] {
  return Array.from({ length: count }, (_, index) => {
    const id = `${prefix}-${index + 1}`;
    const shape = SHAPES[index % SHAPES.length] ?? "pair";
    return { id, shape, tasks: tasksFor(shape, id) };
  });
}
