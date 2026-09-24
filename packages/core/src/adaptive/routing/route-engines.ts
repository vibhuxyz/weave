import type { HistoryStats } from "../history/index.ts";
import { estimateAttempt, estimateChain, taskKindOf, taskSizeUnits, type AttemptEstimate } from "../estimate/index.ts";
import type { EngineCandidate, EngineRoute, RejectedEngine, RoutableTask } from "./types.ts";

const BASE_CAPABILITIES: readonly string[] = ["fileEditing", "toolCalls"];

export interface RouteInput {
  readonly task: RoutableTask;
  readonly candidates: readonly EngineCandidate[];
  readonly stats: HistoryStats;
  readonly msPerMicroUsd: number;
}

export function requiredCapabilities(task: RoutableTask): readonly string[] {
  return [...new Set([...BASE_CAPABILITIES, ...(task.capabilities ?? [])])].sort();
}

function missingCapabilities(candidate: EngineCandidate, required: readonly string[]): readonly string[] {
  return required.filter((capability) => candidate.capabilities[capability] !== true);
}

function valuePerMs(estimate: AttemptEstimate, msPerMicroUsd: number): number {
  const effortMs = Math.max(1, estimate.ms + msPerMicroUsd * Number(estimate.costMicroUsd));
  return estimate.successProbability / effortMs;
}

export function routeTask(input: RouteInput): EngineRoute {
  const { task, candidates, stats } = input;
  const required = requiredCapabilities(task);
  const rejected: RejectedEngine[] = candidates.flatMap((candidate) => {
    const missing = missingCapabilities(candidate, required);
    return missing.length === 0 ? [] : [{ engineId: candidate.id, reason: `missing ${missing.join(", ")}` }];
  });
  const rejectedIds = new Set(rejected.map((entry) => entry.engineId));
  const eligible = candidates.filter((candidate) => !rejectedIds.has(candidate.id));
  const query = { kind: taskKindOf(task), sizeUnits: taskSizeUnits(task) };
  if (eligible.length === 0) {
    const configured = candidates.map((candidate) => estimateAttempt(stats, { ...query, engineId: candidate.id }));
    return { taskId: task.id, engines: candidates.map((candidate) => candidate.id), estimate: estimateChain(configured), rejected, reason: `no engine declares ${required.join(", ")}; keeping the configured order` };
  }
  const configuredIndex = new Map(eligible.map((candidate, index) => [candidate.id, index]));
  const ranked = eligible
    .map((candidate) => estimateAttempt(stats, { ...query, engineId: candidate.id }))
    .sort((a, b) => valuePerMs(b, input.msPerMicroUsd) - valuePerMs(a, input.msPerMicroUsd) || (configuredIndex.get(a.engineId) ?? 0) - (configuredIndex.get(b.engineId) ?? 0));
  const first = ranked[0];
  const reason = first
    ? `${first.engineId} first: p(success)=${first.successProbability.toFixed(2)}, ~${Math.round(first.ms / 1000)}s per attempt for ${query.kind}`
    : "no candidates";
  return { taskId: task.id, engines: ranked.map((estimate) => estimate.engineId), estimate: estimateChain(ranked), rejected, reason };
}
