/**
 * Stop, properly. CONTINUATION.md §8, §10 Slice 4.
 *
 *   1. cancel()                     ask the engine to stop the turn
 *   2. drain, bounded                late updates still reach the ledger
 *   3. readGitStatus(cwd)            rank-1 evidence, after the dust settles
 *   4. foldTaskState(readLedger())   rank-2 evidence
 *   5. writeCheckpoint(...)          immutable, named by seq
 *   6. task.status = "paused"        the task survives
 *
 * Step 7 — emitting `checkpoint.created` on the live ledger — is the caller's
 * job, not this function's: a caller recovering a task after a hard kill has
 * no live `Ledger` to append to (constructing one against an existing runId
 * would restart its in-memory seq counter at 0 and corrupt the file), so this
 * function never touches a `Ledger` directly. A caller that *does* have one
 * appends `checkpoint.created` itself using the returned `Checkpoint`.
 */

import type { CheckpointReason, TaskState } from "@weave/protocol";
import { readGitStatus, readHeadCommit } from "./git.ts";
import { readLedger } from "./ledger.ts";
import { foldTaskState } from "./state.ts";
import { writeCheckpoint, type Checkpoint } from "./checkpoint.ts";
import type { TasksStore } from "./tasks-store.ts";

export interface StopSequenceOptions {
  weaveDir: string;
  /** The project directory — where `git status` is read from. */
  cwd: string;
  taskId: string;
  /** The run whose ledger holds this attempt's events. */
  runId: string;
  /** `TaskRecord.goal`, unchanged since task creation. */
  goal: string;
  reason: CheckpointReason;
  tasksStore: TasksStore;
  /** Step 1. Optional: a caller recovering a dead task after the fact has
   * nothing left to cancel — the process is already gone. */
  cancel?: () => Promise<void> | void;
  /** Step 2's bound, ms. ACP cancellation is cooperative; a hung engine must
   * not block the checkpoint, so this always proceeds after the timeout. */
  drainMs?: number;
}

export interface StopSequenceResult {
  checkpoint: Checkpoint;
  taskStatus: Awaited<ReturnType<TasksStore["endAttempt"]>>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runStopSequence(options: StopSequenceOptions): Promise<StopSequenceResult> {
  const { weaveDir, cwd, taskId, runId, goal, reason, tasksStore, cancel, drainMs = 2000 } = options;

  await cancel?.(); // 1
  await sleep(drainMs); // 2

  // 3 — rank-1, after the dust settles, and always before the fold (§8: "Git
  // status taken during a live write sees a partial file").
  const [gitStatus, headCommit] = await Promise.all([readGitStatus(cwd), readHeadCommit(cwd)]);

  // 4 — rank-2. `readLedger` reads back only what reached disk; a process
  // killed mid-write has already lost nothing more than the fold can see.
  const events = await readLedger(weaveDir, runId);
  const folded = foldTaskState(events, goal, taskId);
  const state: TaskState = {
    ...folded,
    git: {
      branch: gitStatus.branch,
      // Not derivable without tracking the task's starting commit somewhere
      // (§12 fork B leaves this open) — left null rather than guessed.
      baseCommit: null,
      headCommit,
      dirty: gitStatus.changes.map((c) => c.path),
    },
  };

  const checkpoint = await writeCheckpoint(weaveDir, taskId, state, reason); // 5
  await tasksStore.setLatestCheckpoint(taskId, `${checkpoint.id}.json`);
  const taskStatus = await tasksStore.endAttempt(taskId, state.atSeq, reason); // 6

  return { checkpoint, taskStatus };
}
