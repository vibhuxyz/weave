import { join } from "node:path";
import type { Artifact, ArtifactRecord, ArtifactStatus, ArtifactType } from "@weave/protocol";
import { listJsonFiles, readJsonFile, writeJsonFile } from "./json-file.ts";

export interface CreateArtifactInput {
  readonly id: string;
  readonly runId: string;
  readonly type: ArtifactType;
  readonly producer: string;
  readonly artifact: Artifact;
  readonly now: string;
}

export class ArtifactsStore {
  private readonly runsDir: string;

  constructor(weaveDir: string) {
    this.runsDir = join(weaveDir, "runs");
  }

  private dirFor(runId: string): string {
    return join(this.runsDir, runId, "artifacts");
  }

  private fileFor(runId: string, artifactId: string): string {
    return join(this.dirFor(runId), `${artifactId}.json`);
  }

  async get(runId: string, artifactId: string): Promise<ArtifactRecord | null> {
    return readJsonFile<ArtifactRecord>(this.fileFor(runId, artifactId));
  }

  async list(runId: string): Promise<ArtifactRecord[]> {
    const files = await listJsonFiles(this.dirFor(runId));
    const records = await Promise.all(files.map((file) => readJsonFile<ArtifactRecord>(file)));
    return records
      .filter((record): record is ArtifactRecord => record !== null)
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  async create(input: CreateArtifactInput): Promise<ArtifactRecord> {
    const record: ArtifactRecord = {
      schemaVersion: 1,
      id: input.id,
      runId: input.runId,
      type: input.type,
      status: "draft",
      producer: input.producer,
      createdAt: input.now,
      updatedAt: input.now,
      artifact: input.artifact,
    };
    await writeJsonFile(this.fileFor(record.runId, record.id), record);
    return record;
  }

  async setStatus(
    runId: string,
    artifactId: string,
    status: ArtifactStatus,
    now: string,
  ): Promise<ArtifactRecord> {
    const record = await this.get(runId, artifactId);
    if (!record) throw new Error(`Cannot update unknown artifact ${artifactId} in run ${runId}`);
    const next: ArtifactRecord = { ...record, status, updatedAt: now };
    await writeJsonFile(this.fileFor(runId, artifactId), next);
    return next;
  }

  async publish(runId: string, artifactId: string, artifact: Artifact, now: string): Promise<ArtifactRecord> {
    const record = await this.get(runId, artifactId);
    if (!record) throw new Error(`Cannot publish unknown artifact ${artifactId} in run ${runId}`);
    const next: ArtifactRecord = { ...record, artifact, status: "ready", updatedAt: now };
    await writeJsonFile(this.fileFor(runId, artifactId), next);
    return next;
  }
}
