import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CheckpointReason, TaskState, TaskStateV1, WeaveEvent } from "@weave/protocol";
import { isNotFound } from "../shared/index.ts";
import { upgradeTaskState } from "../state/index.ts";

export interface Checkpoint {
  schemaVersion: 1;
  id: string;
  taskId: string;
  seq: number;
  reason: CheckpointReason;
  createdAt: string;
  state: TaskState;
}

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

    case "file.written":
      return state.changedFiles.modified.length > 0
        ? { checkpoint: true, reason: "file_milestone" }
        : { checkpoint: false };

    case "verification.rung":
      return { checkpoint: true, reason: "verification_milestone" };

    case "agent.message": {
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

function checkpointsDir(weaveDir: string, taskId: string): string {
  return join(weaveDir, "tasks", taskId, "checkpoints");
}

function latestFile(weaveDir: string, taskId: string): string {
  return join(weaveDir, "tasks", taskId, "latest.json");
}

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
  await writeFile(join(dir, `${checkpoint.id}.json`), body);
  await writeFile(latestFile(weaveDir, taskId), body);

  return checkpoint;
}

type StoredCheckpoint = Omit<Checkpoint, "state"> & { state: TaskState | TaskStateV1 };

function upgraded(stored: StoredCheckpoint): Checkpoint {
  return { ...stored, state: upgradeTaskState(stored.state) };
}

export async function readLatest(weaveDir: string, taskId: string): Promise<Checkpoint | null> {
  try {
    return upgraded(JSON.parse(await readFile(latestFile(weaveDir, taskId), "utf8")) as StoredCheckpoint);
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

export async function readCheckpoint(
  weaveDir: string,
  taskId: string,
  seq: number,
): Promise<Checkpoint | null> {
  try {
    const file = join(checkpointsDir(weaveDir, taskId), `${seq}.json`);
    return upgraded(JSON.parse(await readFile(file, "utf8")) as StoredCheckpoint);
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}
