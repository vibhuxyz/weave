import type { FileChangeEntry, Lane, RunEventEntry, RunState, TaskPhase } from "../types";
import { lanePhase, laneProgress, runProgress } from "./lane-phase";

interface StoreShape {
  readonly run: RunState | null;
}

const NO_FILES: readonly FileChangeEntry[] = [];
const NO_EVENTS: readonly RunEventEntry[] = [];

export interface FilesView {
  readonly files: readonly FileChangeEntry[];
  readonly hiddenFileCount: number;
}

export interface EventsView {
  readonly events: readonly RunEventEntry[];
  readonly hiddenEventCount: number;
}

export interface RunSummaryView {
  readonly workers: number;
  readonly tasks: number;
  readonly completed: number;
  readonly progress: number;
  readonly durationMs: number;
  readonly isRunning: boolean;
}

export interface LaneView {
  readonly phase: TaskPhase;
  readonly progress: number | null;
  readonly activity: string | null;
  readonly changedFiles: number;
  readonly waitingFor: readonly string[];
}

export function selectFiles(state: StoreShape): FilesView {
  return {
    files: state.run?.files ?? NO_FILES,
    hiddenFileCount: state.run?.hiddenFileCount ?? 0,
  };
}

export function selectEvents(state: StoreShape): EventsView {
  return {
    events: state.run?.events ?? NO_EVENTS,
    hiddenEventCount: state.run?.hiddenEventCount ?? 0,
  };
}

export function runSummaryOf(run: RunState, now: number): RunSummaryView {
  const order = run.laneOrder;
  const completed = order.filter((taskId) => {
    const lane = run.lanes[taskId];
    return lane !== undefined && lanePhase(lane, run.lanes) === "completed";
  }).length;
  const running = order.filter((taskId) => {
    const lane = run.lanes[taskId];
    if (!lane) return false;
    const phase = lanePhase(lane, run.lanes);
    return phase === "running" || phase === "partially-blocked" || phase === "verifying";
  }).length;
  return {
    workers: running,
    tasks: order.length,
    completed,
    progress: runProgress(run.lanes, order),
    durationMs: (run.finishedAt ?? now) - run.startedAt,
    isRunning: run.outcome === null,
  };
}

export function laneViewOf(lanes: Readonly<Record<string, Lane>>, taskId: string): LaneView | null {
  const lane = lanes[taskId];
  if (!lane) return null;
  return {
    phase: lanePhase(lane, lanes),
    progress: laneProgress(lane),
    activity: lane.activity,
    changedFiles: lane.changedFiles,
    waitingFor: lane.awaited.filter((entry) => !entry.hasArrived).map((entry) => entry.output),
  };
}
