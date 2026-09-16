import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Attempt, CheckpointReason, TaskRecord } from "@weave/protocol";
import { isNotFound } from "../shared/index.ts";

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
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  private async requireTask(taskId: string): Promise<TaskRecord> {
    const task = await this.get(taskId);
    if (!task) throw new Error(`no such task: ${taskId}`);
    return task;
  }

  async list(): Promise<TaskRecord[]> {
    let ids: string[];
    try {
      ids = await readdir(this.dir);
    } catch (error) {
      if (isNotFound(error)) return [];
      throw error;
    }
    const tasks = await Promise.all(ids.map((id) => this.get(id)));
    return tasks.filter((task): task is TaskRecord => task !== null);
  }

  private async write(task: TaskRecord): Promise<void> {
    const file = this.fileFor(task.id);
    await mkdir(join(file, ".."), { recursive: true });
    await writeFile(file, JSON.stringify(task, null, 2));
  }

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

  async startAttempt(
    taskId: string,
    engineId: string,
    sessionId: string,
    runId: string,
    seqStart: number,
  ): Promise<TaskRecord> {
    const task = await this.requireTask(taskId);
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

  async endAttempt(
    taskId: string,
    seqEnd: number,
    endedBy: CheckpointReason,
  ): Promise<TaskRecord> {
    const task = await this.requireTask(taskId);
    const current = task.attempts.at(-1);
    if (!current || current.endedBy) return task;
    current.seqEnd = seqEnd;
    current.endedBy = endedBy;
    task.status = "paused";
    task.updatedAt = new Date().toISOString();
    await this.write(task);
    return task;
  }

  async complete(taskId: string, seqEnd: number): Promise<TaskRecord> {
    const task = await this.requireTask(taskId);
    const current = task.attempts.at(-1);
    if (current && !current.endedBy) current.seqEnd = seqEnd;
    task.status = "completed";
    task.updatedAt = new Date().toISOString();
    await this.write(task);
    return task;
  }

  async setStatus(taskId: string, status: TaskRecord["status"]): Promise<void> {
    const task = await this.requireTask(taskId);
    task.status = status;
    task.updatedAt = new Date().toISOString();
    await this.write(task);
  }

  async setLatestCheckpoint(taskId: string, checkpointFile: string): Promise<void> {
    const task = await this.requireTask(taskId);
    task.latestCheckpoint = checkpointFile;
    task.updatedAt = new Date().toISOString();
    await this.write(task);
  }
}
