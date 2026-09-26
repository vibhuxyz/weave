import type { RunExecutionSlot, RunWorkerCount } from "../../../../server/index.ts";

const MS_PER_MINUTE = 60_000;

export function durationMinutes(ms: number): number {
  return Math.max(1, Math.round(ms / MS_PER_MINUTE));
}

export function slotStartText(slot: Pick<RunExecutionSlot, "startMs" | "after">): string {
  if (slot.startMs === 0) return "starts now";
  if (slot.after.length > 0) return `after ${slot.after.join(", ")}`;
  return "when a worker frees up";
}

export function engineText(slot: Pick<RunExecutionSlot, "engineId" | "fallbackEngineIds">): string {
  const engine = slot.engineId ?? "default engine";
  return slot.fallbackEngineIds.length > 0 ? `${engine} (then ${slot.fallbackEngineIds.join(", ")})` : engine;
}

const LIMIT_LABEL = {
  plan: "the plan",
  setting: "this project's limit",
  machine: "this machine",
  budget: "the cost limits",
} as const;

export function workerCountText(count: RunWorkerCount): string {
  return `${count.workers} ${count.workers === 1 ? "worker" : "workers"}, set by ${LIMIT_LABEL[count.limitedBy]}`;
}

export function workerCapacityText(count: RunWorkerCount): string {
  const affordable = count.affordable === null ? [] : [`cost limits afford ${count.affordable}`];
  return [`plan asks for ${count.requested}`, `project allows ${count.maxWorkers}`, `machine fits ${count.machineCapacity}`, ...affordable].join(" · ");
}
