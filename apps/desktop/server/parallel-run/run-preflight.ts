import type { Budgets } from "@weave/core";
import { loadBudgets, type BudgetLoad } from "../budgets/index.ts";
import { prepareRepo, type RepoCheck } from "../git-setup/index.ts";
import { errorMessage, type RunOutcome } from "../shared/index.ts";

export interface RunDependencies {
  readonly readBudgets: (projectDir: string) => Promise<BudgetLoad>;
  readonly prepareRepo: (projectDir: string, options: { readonly shouldSetUp: boolean }) => Promise<RepoCheck>;
}

export const DEFAULT_RUN_DEPENDENCIES: RunDependencies = { readBudgets: loadBudgets, prepareRepo };

export type Preflight = { readonly ok: true; readonly budgets: Budgets } | { readonly ok: false; readonly outcome: RunOutcome };

function repoOutcome(repo: Exclude<RepoCheck, { ok: true }>): RunOutcome {
  return repo.needsSetup ? { status: "needs-git", reason: repo.reason } : { status: "error", reason: repo.reason };
}

export async function preflight(input: { readonly projectDir: string; readonly setUpGit: boolean }, dependencies: RunDependencies): Promise<Preflight> {
  const repo = await dependencies.prepareRepo(input.projectDir, { shouldSetUp: input.setUpGit }).catch((error: unknown): RepoCheck => ({
    ok: false, needsSetup: false, reason: `Cannot set up git in ${input.projectDir}: ${errorMessage(error)}`,
  }));
  if (!repo.ok) return { ok: false, outcome: repoOutcome(repo) };
  const budgets = await dependencies.readBudgets(input.projectDir);
  if (!budgets.ok) return { ok: false, outcome: { status: "error", reason: `Cannot start a parallel run: ${budgets.message}` } };
  return { ok: true, budgets: budgets.budgets };
}
