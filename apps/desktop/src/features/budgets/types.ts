import type { BudgetSettings, LimitSettings, ServerMessage, SpendView } from "../../../server/index.ts";

export type { BudgetSettings, LimitSettings, SpendView };

export type BudgetListingMessage = Extract<ServerMessage, { readonly type: "budgets" | "budgets-failed" }>;

export type BudgetState =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly settings: BudgetSettings; readonly spent: SpendView; readonly issue: string | null }
  | { readonly status: "error"; readonly message: string };

export type BudgetSaveResult = { readonly ok: true } | { readonly ok: false; readonly message: string };

export interface BudgetActions {
  readonly readBudgets: () => void;
  readonly saveBudgets: (settings: BudgetSettings) => Promise<BudgetSaveResult>;
}
