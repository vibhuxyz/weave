import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Attempt, CheckpointReason, TaskRecord } from "@weave/protocol";

/**
 * `.weave/tasks/<taskId>/task.json` — one file per task, whole-file rewrite,
 * same discipline as {@link ConversationStore}. Unlike conversations, tasks
 * are not listed from a single shared file: a task can be long-lived and
 * many processes may touch it across its life, so each gets its own file and
 * `list()` reads the directory.
 *
 * See `docs/CONTINUATION.md` §5, §10 (Slice 1).
 */
export class TasksStore {
  private readonly dir: string;

  constructor(weaveDir: string) {
    this.dir = join(weaveDir, "tasks");
  }

  private fileFor(taskId: string): string {
    return join(this.dir, taskId, "task.json");
  }

  async get(taskId: string): Promise<TaskRecord | null> {
    try {
      return JSON.parse(await readFile(this.fileFor(taskId), "utf8")) as TaskRecord;
    } catch {
      return null;
    }
  }

  async list(): Promise<TaskRecord[]> {
    let ids: string[];
    try {
      ids = await readdir(this.dir);
    } catch {
      return [];
    }
    const tasks = await Promise.all(ids.map((id) => this.get(id)));
    return tasks.filter((t): t is TaskRecord => t !== null);
  }

  private async write(task: TaskRecord): Promise<void> {
    const file = this.fileFor(task.id);
    await mkdir(join(file, ".."), { recursive: true });
    await writeFile(file, JSON.stringify(task, null, 2));
  }

  /** Start a new task with its first attempt already open. */
  async create(
    id: string,
    goal: string,
    cwd: string,
    engineId: string,
    sessionId: string,
    runId: string,
    seqStart: number,
  ): Promise<TaskRecord> {
    const now = new Date().toISOString();
    const attempt: Attempt = { index: 0, engineId, sessionId, runId, seqStart };
    const task: TaskRecord = {
      schemaVersion: 1,
      id,
      goal,
      cwd,
      status: "running",
      createdAt: now,
      updatedAt: now,
      attempts: [attempt],
      latestCheckpoint: null,
    };
    await this.write(task);
    return task;
  }

  /** Open a new attempt on an existing task — an engine switch or a resume. */
  async startAttempt(
    taskId: string,
    engineId: string,
    sessionId: string,
    runId: string,
    seqStart: number,
  ): Promise<TaskRecord> {
    const task = await this.get(taskId);
    if (!task) throw new Error(`no such task: ${taskId}`);
    const attempt: Attempt = {
      index: task.attempts.length,
      engineId,
      sessionId,
      runId,
      seqStart,
    };
    task.attempts.push(attempt);
    task.status = "running";
    task.updatedAt = new Date().toISOString();
    await this.write(task);
    return task;
  }

  /** Close the currently-open attempt and pause the task. A no-op — not an
   * error — when the last attempt is already closed: a caller can race a
   * second stop against one already recorded (e.g. an engine switch that
   * failed after the old attempt was ended, followed by cancel), and that is
   * a redundant signal, not a bug worth surfacing to the user. */
  async endAttempt(
    taskId: string,
    seqEnd: number,
    endedBy: CheckpointReason,
  ): Promise<TaskRecord> {
    const task = await this.get(taskId);
    if (!task) throw new Error(`no such task: ${taskId}`);
    const current = task.attempts.at(-1);
    if (!current || current.endedBy) return task;
    current.seqEnd = seqEnd;
    current.endedBy = endedBy;
    task.status = "paused";
    task.updatedAt = new Date().toISOString();
    await this.write(task);
    return task;
  }

  /** Close the open attempt and mark the task done — distinct from
   * {@link endAttempt}: a task that finished has nothing to resume, so
   * `endedBy` (a `CheckpointReason`, all of which describe an interruption)
   * does not apply and status goes to `"completed"`, not `"paused"`. */
  async complete(taskId: string, seqEnd: number): Promise<TaskRecord> {
    const task = await this.get(taskId);
    if (!task) throw new Error(`no such task: ${taskId}`);
    const current = task.attempts.at(-1);
    if (current && !current.endedBy) current.seqEnd = seqEnd;
    task.status = "completed";
    task.updatedAt = new Date().toISOString();
    await this.write(task);
    return task;
  }

  async setStatus(taskId: string, status: TaskRecord["status"]): Promise<void> {
    const task = await this.get(taskId);
    if (!task) throw new Error(`no such task: ${taskId}`);
    task.status = status;
    task.updatedAt = new Date().toISOString();
    await this.write(task);
  }

  async setLatestCheckpoint(taskId: string, checkpointFile: string): Promise<void> {
    const task = await this.get(taskId);
    if (!task) throw new Error(`no such task: ${taskId}`);
    task.latestCheckpoint = checkpointFile;
    task.updatedAt = new Date().toISOString();
    await this.write(task);
  }
}
