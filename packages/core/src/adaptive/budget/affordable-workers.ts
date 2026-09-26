import type { Spend } from "../history/index.ts";
import type { Budgets } from "./types.ts";

const NO_COST_SPENT = 0n;

function remainingCostMicroUsd(budgets: Budgets, projectSpend: Spend): bigint | null {
  const ceilings = [
    ...(budgets.run?.maxCostMicroUsd === undefined ? [] : [budgets.run.maxCostMicroUsd]),
    ...(budgets.project?.maxCostMicroUsd === undefined ? [] : [budgets.project.maxCostMicroUsd - projectSpend.costMicroUsd]),
  ];
  if (ceilings.length === 0) return null;
  return ceilings.reduce((lowest, ceiling) => (ceiling < lowest ? ceiling : lowest));
}

export function affordableWorkers(budgets: Budgets, projectSpend: Spend): number | null {
  const perTask = budgets.task?.maxCostMicroUsd;
  if (perTask === undefined || perTask <= NO_COST_SPENT) return null;
  const remaining = remainingCostMicroUsd(budgets, projectSpend);
  if (remaining === null) return null;
  return remaining <= NO_COST_SPENT ? 1 : Number(remaining / perTask);
}
