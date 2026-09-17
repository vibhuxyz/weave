export type AgentStatus =
  | "idle"
  | "running"
  | "waiting_permission"
  | "waiting_user"
  | "completed"
  | "failed"
  | "interrupted"
  | "cancelled"
  | "provider_limit"; // triggers CheckpointBlock / handoff UI

export type TaskStatus =
  | "idle"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "interrupted"
  | "cancelled"
  | "provider_limit";

export interface CommandResult {
  command: string;
  exitCode: number;
  stdout?: string;
  stderr?: string;
  durationMs?: number;
}

export interface VerificationResult {
  kind: "typecheck" | "lint" | "test" | "build" | "custom";
  status: "passed" | "failed" | "skipped";
  summary: string;
}

export interface Decision {
  description: string;
  rationale?: string;
  timestamp: string;
}

export interface ErrorRecord {
  message: string;
  eventId?: string;
  timestamp: string;
  fatal: boolean;
}

export interface TaskState {
  schemaVersion: 1;
  taskId: string;
  runId: string;
  objective: string;
  status: TaskStatus;
  completed: string[];
  inProgress?: {
    description: string;
    lastStep?: string;
  };
  remaining: string[];
  files: {
    read: string[];
    modified: string[];
    created: string[];
    deleted: string[];
  };
  commands: CommandResult[];
  verification: VerificationResult[];
  decisions: Decision[];
  errors: ErrorRecord[];
  lastCheckpointId?: string;
}

export interface EventCursor {
  lastSeq: number;
  processedEventIds: Set<string>;
}
