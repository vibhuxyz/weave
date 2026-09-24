import type { Budgets, Limits, Spend } from "@weave/core";
import type { BudgetSettings, LimitSettings, SpendView } from "../shared/index.ts";

const MICRO_PER_USD = 1_000_000n;
const MICRO_DIGITS = 6;
const MIN_CENT_DIGITS = 2;

export function usdText(microUsd: bigint): string {
  const fraction = (microUsd % MICRO_PER_USD).toString().padStart(MICRO_DIGITS, "0").replace(/0+$/, "").padEnd(MIN_CENT_DIGITS, "0");
  return `${(microUsd / MICRO_PER_USD).toString()}.${fraction}`;
}

function limitSettings(limits: Limits): LimitSettings {
  return {
    ...(limits.maxCostMicroUsd === undefined ? {} : { maxCostUsd: usdText(limits.maxCostMicroUsd) }),
    ...(limits.maxTokens === undefined ? {} : { maxTokens: limits.maxTokens }),
    ...(limits.maxWallMs === undefined ? {} : { maxWallMs: limits.maxWallMs }),
  };
}

export function budgetSettings(budgets: Budgets): BudgetSettings {
  const scoped = (["project", "run", "task", "employee"] as const).flatMap((scope) => {
    const limits = budgets[scope];
    return limits ? [[scope, limitSettings(limits)] as const] : [];
  });
  const engine = budgets.engine ? Object.fromEntries(Object.entries(budgets.engine).map(([id, limits]) => [id, limitSettings(limits)])) : undefined;
  return { ...Object.fromEntries(scoped), ...(engine ? { engine } : {}) };
}

export function spendView(spend: Spend, runs: number): SpendView {
  return { costUsd: usdText(spend.costMicroUsd), tokens: spend.tokens, wallMs: Math.round(spend.wallMs), runs };
}
