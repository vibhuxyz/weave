import type { Budgets } from "@weave/core";
import { loadBudgets, type BudgetLoad } from "../budgets/index.ts";
import { prepareRepo, type RepoCheck } from "../git-setup/index.ts";
import { holdAwake, type HoldAwake } from "../keep-awake/index.ts";
import { errorMessage, type RunOutcome } from "../shared/index.ts";

export interface RunDependencies {
  readonly readBudgets: (projectDir: string) => Promise<BudgetLoad>;
  readonly prepareRepo: (projectDir: string) => Promise<RepoCheck>;
  readonly holdAwake: HoldAwake;
}

export const DEFAULT_RUN_DEPENDENCIES: RunDependencies = { readBudgets: loadBudgets, prepareRepo, holdAwake };

export type Preflight =
  | { readonly ok: true; readonly budgets: Budgets; readonly repoSetup: string | null }
  | { readonly ok: false; readonly outcome: RunOutcome };

export async function preflight(input: { readonly projectDir: string }, dependencies: RunDependencies): Promise<Preflight> {
  const repo = await dependencies.prepareRepo(input.projectDir).catch((error: unknown): RepoCheck => ({
    ok: false, reason: `Cannot set up git in ${input.projectDir}: ${errorMessage(error)}`,
  }));
  if (!repo.ok) return { ok: false, outcome: { status: "error", reason: repo.reason } };
  const budgets = await dependencies.readBudgets(input.projectDir);
  if (!budgets.ok) return { ok: false, outcome: { status: "error", reason: `Cannot start a parallel run: ${budgets.message}` } };
  return { ok: true, budgets: budgets.budgets, repoSetup: repo.setupSummary };
}
