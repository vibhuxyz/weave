/**
 * Checkpoints: immutable snapshots of a folded `TaskState`, named by the
 * ledger seq they were folded through. CONTINUATION.md §5, §6, §10 Slice 3.
 *
 * Two things live here: the trigger rule (`shouldCheckpoint` — when does an
 * event on the ledger justify a snapshot) and the persistence (`writeCheckpoint`
 * / `readLatest` / `readCheckpoint` — how a snapshot gets to disk and back).
 * Neither does the folding itself; that's `state.ts`. Neither does git status;
 * that's `git.ts`, merged into `state.git` by the Slice 4 Stop sequence
 * before it reaches `writeCheckpoint` — this file just persists whatever
 * `TaskState` it is handed.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CheckpointReason, TaskState, WeaveEvent } from "@weave/protocol";

export interface Checkpoint {
  schemaVersion: 1;
  /** The filename stem under `checkpoints/` — the seq, as a string. */
  id: string;
  taskId: string;
  /** The fold's high-water mark. Same value as `state.atSeq`. */
  seq: number;
  reason: CheckpointReason;
  createdAt: string;
  state: TaskState;
}

// ---------------------------------------------------------------------------
// Trigger rules (§3, §8)
// ---------------------------------------------------------------------------

/**
 * Should this event, having just been folded into `state`, produce a
 * checkpoint?
 *
 * This only covers triggers visible on the ledger stream itself. Two of the
 * nine `CheckpointReason`s — `provider_limit` and `explicit_handoff` — are
 * never detected here: they are decisions made by the caller (a quota
 * callback, a user clicking "switch engine") and arrive at `writeCheckpoint`
 * with the reason already known, via the Slice 4 Stop sequence. Same for
 * `agent_crash`, `timeout`, `user_cancellation`, `max_turns` when Stop itself
 * is what's running — those are still detected below for the case where the
 * *ledger* records the ending (e.g. `task.timeout`, `task.finished`) rather
 * than the process invoking Stop directly.
 */
export function shouldCheckpoint(
  event: WeaveEvent,
  state: TaskState,
): { checkpoint: boolean; reason?: CheckpointReason } {
  switch (event.type) {
    case "task.timeout":
      return {
        checkpoint: true,
        reason: event.reason === "maxTurns" ? "max_turns" : "timeout",
      };

    case "task.finished":
      if (event.status === "cancelled") return { checkpoint: true, reason: "user_cancellation" };
      if (event.status === "failed") return { checkpoint: true, reason: "agent_crash" };
      return { checkpoint: false };

    // Milestones — only when state actually moved, never per token.
    case "file.written":
      return state.files.modified.length > 0
        ? { checkpoint: true, reason: "file_milestone" }
        : { checkpoint: false };

    case "verification.rung":
      return { checkpoint: true, reason: "verification_milestone" };

    case "agent.message": {
      // Plan progress is the closest thing ACP has to "a step finished".
      // Everything else that flows through agent.message is streamed
      // tokens or tool-call chatter — never checkpoint per token.
      const update = event.update as { sessionUpdate?: string } | undefined;
      if (update?.sessionUpdate === "plan" && state.completed.length > 0) {
        return { checkpoint: true, reason: "test_milestone" };
      }
      return { checkpoint: false };
    }

    default:
      return { checkpoint: false };
  }
}

// ---------------------------------------------------------------------------
// Persistence (§5)
// ---------------------------------------------------------------------------

function checkpointsDir(weaveDir: string, taskId: string): string {
  return join(weaveDir, "tasks", taskId, "checkpoints");
}

function latestFile(weaveDir: string, taskId: string): string {
  return join(weaveDir, "tasks", taskId, "latest.json");
}

/** Write an immutable checkpoint named by seq, and overwrite the `latest.json`
 * pointer to match. Both writes are whole-file (`writeFile`, not append) —
 * `latest.json` gets rewritten on every checkpoint and an appending write
 * would leave two JSON documents nose to tail. */
export async function writeCheckpoint(
  weaveDir: string,
  taskId: string,
  state: TaskState,
  reason: CheckpointReason,
): Promise<Checkpoint> {
  const checkpoint: Checkpoint = {
    schemaVersion: 1,
    id: String(state.atSeq),
    taskId,
    seq: state.atSeq,
    reason,
    createdAt: new Date().toISOString(),
    state,
  };

  const dir = checkpointsDir(weaveDir, taskId);
  await mkdir(dir, { recursive: true });
  const body = JSON.stringify(checkpoint, null, 2);
  // Named by seq: writing the same seq twice (e.g. a re-fold that lands on
  // an identical high-water mark) overwrites with an identical body, which
  // is exactly what "immutable snapshot" requires — content is a pure
  // function of seq, so two writes at the same seq can never disagree.
  await writeFile(join(dir, `${checkpoint.id}.json`), body);
  await writeFile(latestFile(weaveDir, taskId), body);

  return checkpoint;
}

export async function readLatest(weaveDir: string, taskId: string): Promise<Checkpoint | null> {
  try {
    return JSON.parse(await readFile(latestFile(weaveDir, taskId), "utf8")) as Checkpoint;
  } catch {
    return null;
  }
}

/** Read back one checkpoint by the seq it was written at. */
export async function readCheckpoint(
  weaveDir: string,
  taskId: string,
  seq: number,
): Promise<Checkpoint | null> {
  try {
    const file = join(checkpointsDir(weaveDir, taskId), `${seq}.json`);
    return JSON.parse(await readFile(file, "utf8")) as Checkpoint;
  } catch {
    return null;
  }
}
