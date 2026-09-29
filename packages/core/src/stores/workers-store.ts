import { join } from "node:path";
import type { WorkerRecord, WorkerRuntime, WorkerStatus, WorkerWorkspace } from "@weave/protocol";
import { listJsonFiles, readJsonFile, writeJsonFile } from "./json-file.ts";

const TERMINAL_STATUSES: readonly WorkerStatus[] = ["completed", "failed", "cancelled"];

export interface CreateWorkerInput {
  readonly id: string;
  readonly runId: string;
  readonly taskId: string;
  readonly runtime: WorkerRuntime;
  readonly now: string;
}

export interface WorkerUpdate {
  readonly status?: WorkerStatus;
  readonly currentActivity?: string | null;
  readonly completedSteps?: number;
  readonly totalSteps?: number | null;
  readonly workspace?: WorkerWorkspace | null;
}

export class WorkersStore {
  private readonly runsDir: string;

  constructor(weaveDir: string) {
    this.runsDir = join(weaveDir, "runs");
  }

  private dirFor(runId: string): string {
    return join(this.runsDir, runId, "workers");
  }

  private fileFor(runId: string, workerId: string): string {
    return join(this.dirFor(runId), `${workerId}.json`);
  }

  async get(runId: string, workerId: string): Promise<WorkerRecord | null> {
    return readJsonFile<WorkerRecord>(this.fileFor(runId, workerId));
  }

  async list(runId: string): Promise<WorkerRecord[]> {
    const files = await listJsonFiles(this.dirFor(runId));
    const records = await Promise.all(files.map((file) => readJsonFile<WorkerRecord>(file)));
    return records
      .filter((record): record is WorkerRecord => record !== null)
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  async create(input: CreateWorkerInput): Promise<WorkerRecord> {
    const worker: WorkerRecord = {
      schemaVersion: 1,
      id: input.id,
      runId: input.runId,
      taskId: input.taskId,
      runtime: input.runtime,
      status: "created",
      progress: { completedSteps: 0, totalSteps: null },
      currentActivity: null,
      workspace: null,
      startedAt: null,
      updatedAt: input.now,
      finishedAt: null,
    };
    await writeJsonFile(this.fileFor(worker.runId, worker.id), worker);
    return worker;
  }

  async update(
    runId: string,
    workerId: string,
    update: WorkerUpdate,
    now: string,
  ): Promise<WorkerRecord> {
    const worker = await this.get(runId, workerId);
    if (!worker) throw new Error(`Cannot update unknown worker ${workerId} in run ${runId}`);
    const status = update.status ?? worker.status;
    const next: WorkerRecord = {
      ...worker,
      status,
      progress: {
        completedSteps: update.completedSteps ?? worker.progress.completedSteps,
        totalSteps: update.totalSteps === undefined ? worker.progress.totalSteps : update.totalSteps,
      },
      currentActivity:
        update.currentActivity === undefined ? worker.currentActivity : update.currentActivity,
      workspace: update.workspace === undefined ? worker.workspace : update.workspace,
      startedAt: worker.startedAt ?? (status === "running" ? now : null),
      updatedAt: now,
      finishedAt: TERMINAL_STATUSES.includes(status) ? now : worker.finishedAt,
    };
    await writeJsonFile(this.fileFor(runId, workerId), next);
    return next;
  }
}
