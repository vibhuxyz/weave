import type { ResourceRef } from "@weave/protocol";
import { claimsForTask, resourcesOverlap } from "../../coordination/index.ts";
import { listSchedule, type Schedule } from "../estimate/index.ts";
import { DEFAULT_CONFLICT_RATE, DEFAULT_COORDINATION_MS, OVERLAP_CONFLICT_PROBABILITY } from "./constants.ts";
import type { BenefitBreakdown, BenefitTask, WorkerCountInput } from "./types.ts";

interface ConcurrentPairs {
  readonly all: number;
  readonly overlapping: number;
}

function claimsOverlap(a: readonly ResourceRef[], b: readonly ResourceRef[]): boolean {
  return a.some((claim) => b.some((other) => resourcesOverlap(claim, other)));
}

function exclusivity(tasks: readonly BenefitTask[]): (a: string, b: string) => boolean {
  const claims = new Map(tasks.map((task) => [task.id, claimsForTask(task)]));
  return (a, b) => a !== b && claimsOverlap(claims.get(a) ?? [], claims.get(b) ?? []);
}

function isUnclaimed(task: BenefitTask): boolean {
  return (task.allowedPaths ?? []).length === 0 && (task.owns ?? []).length === 0;
}

function concurrentPairs(tasks: readonly BenefitTask[], schedule: Schedule): ConcurrentPairs {
  let all = 0;
  let overlapping = 0;
  tasks.forEach((task, index) => {
    const own = schedule.intervals.get(task.id);
    for (const other of tasks.slice(index + 1)) {
      const theirs = schedule.intervals.get(other.id);
      if (!own || !theirs || own.endMs <= theirs.startMs || theirs.endMs <= own.startMs) continue;
      all += 1;
      if (isUnclaimed(task) || isUnclaimed(other)) overlapping += 1;
    }
  });
  return { all, overlapping };
}

function meanDuration(input: WorkerCountInput): number {
  const total = input.tasks.reduce((sum, task) => sum + input.durationOf(task.id), 0);
  return input.tasks.length === 0 ? 0 : total / input.tasks.length;
}

export function expectedBenefit(input: WorkerCountInput, workers: number, sequentialMs: number): BenefitBreakdown {
  const schedule = listSchedule(input.tasks, input.durationOf, workers, exclusivity(input.tasks));
  const pairs = concurrentPairs(input.tasks, schedule);
  const reworkMs = meanDuration(input);
  const conflictRate = input.stats.conflictRate ?? DEFAULT_CONFLICT_RATE;
  const timeSaved = sequentialMs - schedule.makespanMs;
  const coordination = (workers - 1) * (input.stats.coordinationMsPerWorker ?? DEFAULT_COORDINATION_MS);
  const mergeRisk = (conflictRate * pairs.all + OVERLAP_CONFLICT_PROBABILITY * pairs.overlapping) * reworkMs;
  const verification = pairs.all > 0 ? input.stats.verifyMs ?? 0 : 0;
  const startup = (workers - 1) * input.startupMs;
  const total = timeSaved - coordination - mergeRisk - verification - startup;
  return { workers, makespanMs: schedule.makespanMs, timeSaved, coordination, mergeRisk, verification, startup, total };
}
