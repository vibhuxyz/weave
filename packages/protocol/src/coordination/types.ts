export type ResourceKind =
  | "file"
  | "directory"
  | "module"
  | "symbol"
  | "api"
  | "event"
  | "schema"
  | "resource";

export interface ResourceRef {
  kind: ResourceKind;
  id: string;
}

export interface ArtifactFile {
  path: string;
  content: string;
}

export interface Artifact {
  name: string;
  version: number;
  summary: string;
  files: ArtifactFile[];
}

export interface DependencyNeed {
  output: string;
  task?: string;
  resource?: ResourceRef;
}

export interface CoordinationDataByType {
  "task.started": Record<string, never>;
  "task.blocked": { reason: string };
  "task.completed": { status: "ok" | "failed" | "cancelled" | "skipped" };
  "artifact.ready": { artifact: Artifact };
  "artifact.updated": { artifact: Artifact };
  "contract.published": { artifact: Artifact };
  "contract.changed": { artifact: Artifact };
  "dependency.ready": { consumer: string; outputs: string[] };
  "dependency.blocked": { need: DependencyNeed; reason: string };
  "dependency.resolved": { consumer: string; producer: string; output: string };
  "review.requested": { summary: string };
  "verification.failed": { summary: string };
  "verification.passed": { summary: string };
  "escalation.created": { reason: string; subject: string };
}

export type CoordinationEventType = keyof CoordinationDataByType;

interface CoordinationEnvelope {
  id: string;
  version: number;
  seq: number;
  occurredAt: string;
  correlationId: string;
  from: string;
}

export type CoordinationEvent = {
  [K in CoordinationEventType]: CoordinationEnvelope & { type: K; data: CoordinationDataByType[K] };
}[CoordinationEventType];

export type CoordinationEventOf<K extends CoordinationEventType> = Extract<CoordinationEvent, { type: K }>;

export type CoordinationDraft = {
  [K in CoordinationEventType]: { type: K; data: CoordinationDataByType[K] };
}[CoordinationEventType];

export type EmployeeEventType =
  | "task.blocked"
  | "artifact.ready"
  | "artifact.updated"
  | "contract.published"
  | "contract.changed"
  | "dependency.blocked"
  | "review.requested"
  | "verification.failed"
  | "verification.passed"
  | "escalation.created";

export type EmployeeDraft = Extract<CoordinationDraft, { type: EmployeeEventType }>;
