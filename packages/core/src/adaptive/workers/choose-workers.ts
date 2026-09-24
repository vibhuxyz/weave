import { expectedBenefit } from "./expected-benefit.ts";
import type { BenefitBreakdown, WorkerCountChoice, WorkerCountInput } from "./types.ts";

const SECOND_MS = 1_000;

function describe(choice: BenefitBreakdown, isTimeBound: boolean): string {
  const seconds = (ms: number): string => `${Math.round(ms / SECOND_MS)}s`;
  if (choice.workers === 1 && !isTimeBound) return "1 worker: no worker count saves time after coordination, merge risk, verification and startup";
  const bound = isTimeBound ? " to fit the time budget" : "";
  return `${choice.workers} workers${bound}: saves ~${seconds(choice.timeSaved)}, costs ~${seconds(choice.coordination + choice.mergeRisk + choice.verification + choice.startup)} → net ${seconds(choice.total)}`;
}

function best(options: readonly BenefitBreakdown[]): BenefitBreakdown | undefined {
  return options.reduce<BenefitBreakdown | undefined>((winner, option) => (!winner || option.total > winner.total ? option : winner), undefined);
}

export function chooseWorkers(input: WorkerCountInput): WorkerCountChoice {
  const maxWorkers = Math.max(1, Math.min(Math.floor(input.maxWorkers), input.tasks.length));
  const sequentialMs = expectedBenefit(input, 1, 0).makespanMs;
  const considered = Array.from({ length: maxWorkers }, (_, index) => expectedBenefit(input, index + 1, sequentialMs));
  const maxWallMs = input.maxWallMs ?? Infinity;
  const withinTime = considered.filter((option) => option.makespanMs <= maxWallMs);
  const isTimeBound = sequentialMs > maxWallMs && withinTime.length > 0;
  const eligible = isTimeBound ? withinTime : considered.filter((option) => option.workers === 1 || option.total > 0);
  const chosen = best(eligible) ?? expectedBenefit(input, 1, sequentialMs);
  return { workers: chosen.workers, reason: describe(chosen, isTimeBound), chosen, considered };
}
