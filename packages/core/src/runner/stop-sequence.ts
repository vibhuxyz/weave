import type { CheckpointReason, TaskState } from "@weave/protocol";
import { readGitStatus, readHeadCommit, readLedger } from "../shared/index.ts";
import { foldTaskState } from "../state/index.ts";
import { writeCheckpoint, type Checkpoint } from "../checkpoint/index.ts";
import type { TasksStore } from "../stores/index.ts";

const DEFAULT_DRAIN_MS = 2000;

export interface StopSequenceOptions {
  weaveDir: string;
  cwd: string;
  taskId: string;
  runId: string;
  goal: string;
  reason: CheckpointReason;
  tasksStore: TasksStore;
  cancel?: () => Promise<void> | void;
  drainMs?: number;
}

export interface StopSequenceResult {
  checkpoint: Checkpoint;
  taskStatus: Awaited<ReturnType<TasksStore["endAttempt"]>>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function foldStoppedState(weaveDir: string, cwd: string, runId: string, goal: string, taskId: string): Promise<TaskState> {
  const [gitStatus, headCommit] = await Promise.all([readGitStatus(cwd), readHeadCommit(cwd)]);
  const events = await readLedger(weaveDir, runId);
  const folded = foldTaskState(events, goal, taskId);
  return {
    ...folded,
    git: {
      branch: gitStatus.branch,
      baseCommit: null,
      headCommit,
      dirty: gitStatus.changes.map((c) => c.path),
    },
  };
}

export async function runStopSequence(options: StopSequenceOptions): Promise<StopSequenceResult> {
  const { weaveDir, cwd, taskId, runId, goal, reason, tasksStore, cancel, drainMs = DEFAULT_DRAIN_MS } = options;

  await cancel?.();
  await sleep(drainMs);

  const state = await foldStoppedState(weaveDir, cwd, runId, goal, taskId);

  const checkpoint = await writeCheckpoint(weaveDir, taskId, state, reason);
  await tasksStore.setLatestCheckpoint(taskId, `${checkpoint.id}.json`);
  const taskStatus = await tasksStore.endAttempt(taskId, state.atSeq, reason);

  return { checkpoint, taskStatus };
}
