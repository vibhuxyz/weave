import { useBudgetStore } from "../store";
import type { BudgetState } from "../types";

export function useBudgetState(): BudgetState {
  return useBudgetStore((state) => state.budgets);
}
