import type { VerificationRung } from "../verification/index.ts";

export type CheckpointReason =
  | "user_cancellation"
  | "provider_limit"
  | "agent_crash"
  | "timeout"
  | "max_turns"
  | "explicit_handoff"
  | "file_milestone"
  | "verification_milestone"
  | "test_milestone";

export type TaskRecordStatus = "running" | "paused" | "completed" | "failed";

export interface Attempt {
  index: number;
  engineId: string;
  sessionId: string;
  runId: string;
  seqStart: number;
  seqEnd?: number;
  endedBy?: CheckpointReason;
}

export interface TaskRecord {
  schemaVersion: 1;
  id: string;
  goal: string;
  cwd: string;
  status: TaskRecordStatus;
  createdAt: string;
  updatedAt: string;
  attempts: Attempt[];
  latestCheckpoint: string | null;
}

export interface CommandResult {
  command: string;
  ok: boolean;
  wallMs: number;
  output?: string;
}

export interface VerificationResult {
  rung: VerificationRung;
  status: "passed" | "failed";
  wallMs: number;
}

export interface Decision {
  description: string;
  claimed: true;
  atSeq: number;
}

export interface ErrorRecord {
  message: string;
  where: string;
  atSeq: number;
}

export interface ToolCallRef {
  toolCallId: string;
  title: string;
  kind?: string;
  locations: string[];
  startedAtSeq: number;
}

export interface GitState {
  branch: string | null;
  baseCommit: string | null;
  headCommit: string | null;
  dirty: string[];
}

export interface TaskState {
  schemaVersion: 1;
  taskId: string;
  goal: string;
  atSeq: number;
  completed: string[];
  inProgress: { description: string } | null;
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
  inFlight: ToolCallRef[];
  git: GitState;
}
