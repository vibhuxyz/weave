import { withChosenEngine, type EngineCandidate } from "../../adaptive/index.ts";
import type { PlannedTask } from "../../planner/index.ts";
import type { Ledger } from "../../shared/index.ts";

export interface ChosenEnginesInput {
  readonly tasks: readonly PlannedTask[];
  readonly routes: ReadonlyMap<string, readonly string[]> | undefined;
  readonly defaults: readonly string[];
  readonly candidates: readonly EngineCandidate[];
  readonly ledger: Ledger;
}

export function chosenEngineRoutes(input: ChosenEnginesInput): ReadonlyMap<string, readonly string[]> | undefined {
  const { tasks, routes, ledger } = input;
  if (!tasks.some((task) => task.engine !== undefined)) return routes;
  const chosen = new Map<string, readonly string[]>();
  for (const task of tasks) {
    const chain = routes?.get(task.id) ?? input.defaults;
    const decided = withChosenEngine({ task, chain, candidates: input.candidates });
    if (decided.refusal) ledger.append("error", { taskId: task.id, where: "engine.choice", message: `Task ${task.id}: ${decided.refusal}` });
    chosen.set(task.id, decided.chain);
  }
  return chosen;
}
