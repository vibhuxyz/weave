import type { Lane, LaneStatus, RunState, StreamBlock } from "../types";
import { PLANNER_TASK_ID } from "../constants";

export interface WorkerPane {
  readonly taskId: string;
  readonly title: string;
  readonly status: LaneStatus;
  readonly block: StreamBlock | null;
  readonly waitingFor: string | null;
}

export interface WorkerPanes {
  readonly live: readonly WorkerPane[];
  readonly waiting: readonly WorkerPane[];
  readonly done: readonly WorkerPane[];
}

const NO_PANES: WorkerPanes = { live: [], waiting: [], done: [] };

export const NO_LANES: Readonly<Record<string, Lane>> = {};
export const NO_LANE_ORDER: readonly string[] = [];
export const NO_STREAM: readonly StreamBlock[] = [];

function waitingReason(lane: Lane): string | null {
  const outstanding = lane.awaited.find((entry) => !entry.hasArrived);
  if (outstanding) return `${outstanding.output} from ${outstanding.producer ?? "another worker"}`;
  if (lane.blockedReason !== null) return lane.blockedReason;
  if (lane.status === "waiting") {
    return lane.startsAfter.length > 0 ? `${lane.startsAfter.join(", ")} to finish` : "a worker to free up";
  }
  return null;
}

function paneOf(lane: Lane, block: StreamBlock | null): WorkerPane {
  return { taskId: lane.taskId, title: lane.title, status: lane.status, block, waitingFor: waitingReason(lane) };
}

/**
 * Pure, so the component can hold it behind a `useMemo`. Returning freshly
 * built arrays straight from a store selector re-renders forever: every call
 * is a new reference, so nothing ever compares equal.
 */
export function workerPanes(
  lanes: Readonly<Record<string, Lane>>,
  laneOrder: readonly string[],
  stream: readonly StreamBlock[],
): WorkerPanes {
  const latest = new Map<string, StreamBlock>();
  for (const block of stream) if (block.taskId !== PLANNER_TASK_ID) latest.set(block.taskId, block);

  const live: WorkerPane[] = [];
  const waiting: WorkerPane[] = [];
  const done: WorkerPane[] = [];
  for (const taskId of laneOrder) {
    const lane = lanes[taskId];
    if (lane === undefined || taskId === PLANNER_TASK_ID) continue;
    const pane = paneOf(lane, latest.get(taskId) ?? null);
    if (lane.status === "running" && pane.waitingFor === null) live.push(pane);
    else if (lane.status === "running" || lane.status === "waiting") waiting.push(pane);
    else done.push(pane);
  }
  return { live, waiting, done };
}

export function selectWorkerPanes(state: { readonly run: RunState | null }): WorkerPanes {
  const run = state.run;
  return run === null ? NO_PANES : workerPanes(run.lanes, run.laneOrder, run.stream);
}
