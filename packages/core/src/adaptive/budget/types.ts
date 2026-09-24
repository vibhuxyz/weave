import type { Spend } from "../history/index.ts";

export type BudgetScope = "project" | "run" | "task" | "employee" | "engine";
export type BudgetDimension = "cost" | "tokens" | "time";

export interface Limits {
  readonly maxCostMicroUsd?: bigint;
  readonly maxTokens?: number;
  readonly maxWallMs?: number;
}

export interface Budgets {
  readonly project?: Limits;
  readonly run?: Limits;
  readonly task?: Limits;
  readonly employee?: Limits;
  readonly engine?: Readonly<Record<string, Limits>>;
}

export interface Exceeded {
  readonly dimension: BudgetDimension;
  readonly limit: string;
  readonly spent: string;
}

export interface ScopeKey {
  readonly scope: BudgetScope;
  readonly key: string;
}

export interface BudgetActions {
  readonly stopTask: (taskId: string, reason: string) => void;
  readonly stopRun: (reason: string) => void;
}

export type Admission = { readonly ok: true } | { readonly ok: false; readonly reason: string };

export const NO_SPEND: Spend = { costMicroUsd: 0n, tokens: 0, wallMs: 0 };
