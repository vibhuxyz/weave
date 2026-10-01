import { listSchedule, MIN_HISTORY_RUNS, planOrchestration, type OrchestrationTask } from "../adaptive/index.ts";
import { workspaceDirsOf } from "./area-of.ts";
import { TASK_ID_PREFIX } from "./constants.ts";
import { groupItems } from "./group-items.ts";
import { groupsWaitedOn } from "./order-groups.ts";
import type { EstimateTeamInput, GroupTask, ProposedWorker, TeamEstimate, WorkGroup } from "./types.ts";

interface ReasonInput {
  readonly groups: readonly WorkGroup[];
  readonly isTeam: boolean;
  readonly workers: number;
  readonly orchestrationReason: string;
}

function reasonFor(input: ReasonInput): string {
  const { groups } = input;
  if (groups.length <= 1) return `All the remaining work is in ${groups[0]?.areas.join(", ") ?? "one area"}, so one worker is enough.`;
  if (!input.isTeam) return `The work splits into ${groups.length} groups, but more workers would not finish sooner: ${input.orchestrationReason}.`;
  return `The work splits into ${groups.length} groups that touch different parts of the project, so ${input.workers} workers can run at the same time.`;
}

function taskIdOf(index: number): string {
  return `${TASK_ID_PREFIX}${index + 1}`;
}

function groupTask(group: WorkGroup, index: number): GroupTask {
  return { id: taskIdOf(index), prompt: group.items.map((item) => item.description).join("\n"), allowedPaths: group.areas.map((area) => `${area}/**`) };
}

export function estimateTeam(input: EstimateTeamInput): TeamEstimate {
  const dirs = workspaceDirsOf(input.workspaces);
  const groups = groupItems(input.items, dirs);
  const waits = groupsWaitedOn(groups, input.imports, dirs);
  const tasks: OrchestrationTask[] = groups.map((group, index) => ({
    ...groupTask(group, index),
    dependencies: (waits[index] ?? []).map((waited) => ({ task: taskIdOf(waited) })),
  }));
  const orchestration = planOrchestration({ tasks, engines: input.engines, stats: input.stats, maxWorkers: input.maxWorkers, coldStartWorkers: groups.length });
  const durations = new Map(orchestration.tasks.map((plan) => [plan.taskId, plan.estimatedMs]));
  const durationOf = (taskId: string): number => durations.get(taskId) ?? 0;
  const oneWorkerMs = listSchedule(tasks, durationOf, 1).makespanMs;
  const teamMs = listSchedule(tasks, durationOf, orchestration.workers).makespanMs;
  const isTeam = groups.length > 1 && orchestration.workers > 1 && teamMs < oneWorkerMs;
  const workers: ProposedWorker[] = groups.map((group, index) => ({
    worker: index + 1,
    role: input.roleOf(groupTask(group, index)),
    areas: group.areas,
    items: group.items.map((item) => item.description),
    after: (waits[index] ?? []).map((waited) => waited + 1),
    estimatedMs: durationOf(taskIdOf(index)),
  }));
  const isRough = input.stats.runs < MIN_HISTORY_RUNS;
  const reason = reasonFor({ groups, isTeam, workers: orchestration.workers, orchestrationReason: orchestration.reason });
  return { recommendation: isTeam ? "team" : "keep-going", reason, workers, oneWorkerMs, teamMs, historyRuns: input.stats.runs, isRough };
}
