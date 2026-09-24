import { create } from "zustand";
import type { BudgetListingMessage, BudgetState } from "../types";

interface BudgetStore {
  readonly budgets: BudgetState;
  readonly startLoading: () => void;
  readonly receive: (message: BudgetListingMessage) => void;
  readonly reset: () => void;
}

export const useBudgetStore = create<BudgetStore>((set) => ({
  budgets: { status: "idle" },
  startLoading: () => set((state) => (state.budgets.status === "ready" ? state : { budgets: { status: "loading" } })),
  receive: (message) => set({
    budgets: message.type === "budgets"
      ? { status: "ready", settings: message.settings, spent: message.spent, issue: message.issue }
      : { status: "error", message: message.message },
  }),
  reset: () => set({ budgets: { status: "idle" } }),
}));
