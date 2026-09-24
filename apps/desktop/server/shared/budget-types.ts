export interface LimitSettings {
  readonly maxCostUsd?: string;
  readonly maxTokens?: number;
  readonly maxWallMs?: number;
}

export interface BudgetSettings {
  readonly project?: LimitSettings;
  readonly run?: LimitSettings;
  readonly task?: LimitSettings;
  readonly employee?: LimitSettings;
  readonly engine?: Readonly<Record<string, LimitSettings>>;
}

export interface SpendView {
  readonly costUsd: string;
  readonly tokens: number;
  readonly wallMs: number;
  readonly runs: number;
}

export type BudgetClientMessage =
  | { readonly type: "read-budgets" }
  | { readonly type: "save-budgets"; readonly requestId: string; readonly settings: unknown };

export type BudgetServerMessage =
  | { readonly type: "budgets"; readonly settings: BudgetSettings; readonly spent: SpendView; readonly issue: string | null }
  | { readonly type: "budgets-failed"; readonly message: string }
  | { readonly type: "budgets-saved"; readonly requestId: string }
  | { readonly type: "budgets-save-failed"; readonly requestId: string; readonly message: string };

export const BUDGET_CLIENT_MESSAGE_TYPES = ["read-budgets", "save-budgets"] as const;
