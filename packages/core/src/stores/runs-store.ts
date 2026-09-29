import { join } from "node:path";
import type { RunConfiguration, RunRecord, RunRepository, RunStatus } from "@weave/protocol";
import { listDirNames, readJsonFile, writeJsonFile } from "./json-file.ts";

const TERMINAL_STATUSES: readonly RunStatus[] = ["completed", "failed", "cancelled"];

export interface CreateRunInput {
  readonly id: string;
  readonly prompt: string;
  readonly branch: string | null;
  readonly repository: RunRepository;
  readonly configuration: RunConfiguration;
  readonly now: string;
}

export class RunsStore {
  private readonly dir: string;

  constructor(weaveDir: string) {
    this.dir = join(weaveDir, "runs");
  }

  private fileFor(runId: string): string {
    return join(this.dir, runId, "run.json");
  }

  async get(runId: string): Promise<RunRecord | null> {
    return readJsonFile<RunRecord>(this.fileFor(runId));
  }

  async list(): Promise<RunRecord[]> {
    const ids = await listDirNames(this.dir);
    const records = await Promise.all(ids.map((id) => this.get(id)));
    return records
      .filter((record): record is RunRecord => record !== null)
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  async create(input: CreateRunInput): Promise<RunRecord> {
    const run: RunRecord = {
      schemaVersion: 1,
      id: input.id,
      repository: input.repository,
      status: "pending",
      branch: input.branch,
      prompt: input.prompt,
      createdAt: input.now,
      updatedAt: input.now,
      finishedAt: null,
      configuration: input.configuration,
    };
    await writeJsonFile(this.fileFor(run.id), run);
    return run;
  }

  async setStatus(runId: string, status: RunStatus, now: string): Promise<RunRecord> {
    const run = await this.get(runId);
    if (!run) throw new Error(`Cannot update unknown run ${runId}`);
    const next: RunRecord = {
      ...run,
      status,
      updatedAt: now,
      finishedAt: TERMINAL_STATUSES.includes(status) ? now : run.finishedAt,
    };
    await writeJsonFile(this.fileFor(runId), next);
    return next;
  }

  async setBranch(runId: string, branch: string, now: string): Promise<RunRecord> {
    const run = await this.get(runId);
    if (!run) throw new Error(`Cannot update unknown run ${runId}`);
    const next: RunRecord = { ...run, branch, updatedAt: now };
    await writeJsonFile(this.fileFor(runId), next);
    return next;
  }
}
