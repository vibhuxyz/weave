import type { Artifact } from "../coordination/index.ts";

export const ARTIFACT_TYPES = [
  "api-contract",
  "schema",
  "findings",
  "architecture-decision",
  "test-plan",
  "migration-plan",
  "documentation",
  "code",
  "other",
] as const;

export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

export const ARTIFACT_STATUSES = ["draft", "ready", "superseded", "rejected"] as const;

export type ArtifactStatus = (typeof ARTIFACT_STATUSES)[number];

export interface ArtifactRecord {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly runId: string;
  readonly type: ArtifactType;
  readonly status: ArtifactStatus;
  readonly producer: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly artifact: Artifact;
}
