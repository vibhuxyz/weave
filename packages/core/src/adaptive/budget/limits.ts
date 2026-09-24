import { formatMicroUsd } from "../../shared/index.ts";
import type { Spend } from "../history/index.ts";
import type { Budgets, Exceeded, Limits, ScopeKey } from "./types.ts";

export function exceededLimit(spend: Spend, limits: Limits | undefined): Exceeded | null {
  if (!limits) return null;
  if (limits.maxCostMicroUsd !== undefined && spend.costMicroUsd >= limits.maxCostMicroUsd) {
    return { dimension: "cost", limit: formatMicroUsd(limits.maxCostMicroUsd), spent: formatMicroUsd(spend.costMicroUsd) };
  }
  if (limits.maxTokens !== undefined && spend.tokens >= limits.maxTokens) {
    return { dimension: "tokens", limit: String(limits.maxTokens), spent: String(spend.tokens) };
  }
  if (limits.maxWallMs !== undefined && spend.wallMs >= limits.maxWallMs) {
    return { dimension: "time", limit: `${limits.maxWallMs}ms`, spent: `${Math.round(spend.wallMs)}ms` };
  }
  return null;
}

export function limitsFor(budgets: Budgets, scope: ScopeKey): Limits | undefined {
  switch (scope.scope) {
    case "project":
      return budgets.project;
    case "run":
      return budgets.run;
    case "task":
      return budgets.task;
    case "employee":
      return budgets.employee;
    case "engine":
      return budgets.engine?.[scope.key];
    default: {
      const unhandled: never = scope.scope;
      return unhandled;
    }
  }
}

export function addSpend(a: Spend, b: Spend): Spend {
  return { costMicroUsd: a.costMicroUsd + b.costMicroUsd, tokens: a.tokens + b.tokens, wallMs: a.wallMs + b.wallMs };
}
