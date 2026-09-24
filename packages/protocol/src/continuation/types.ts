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

export type TaskStateStatus = "pending" | "running" | "paused" | "completed" | "failed" | "cancelled";

export interface Discovery {
  text: string;
  source: "tool" | "worker";
  atSeq: number;
}

export type FailureKind = "error" | "command" | "verification" | "tool" | "engine";

export interface Failure {
  kind: FailureKind;
  message: string;
  where: string;
  atSeq: number;
}

export interface OpenQuestion {
  text: string;
  atSeq: number;
}

export interface TaskDependencyRef {
  task: string;
  requiredOutputs: string[];
}

export interface ChangedFiles {
  modified: string[];
  created: string[];
  deleted: string[];
}

export interface EngineState {
  engineId: string | null;
  sessionId: string | null;
  attempts: number;
  turns: number;
  lastStopReason: string | null;
  contextUsed: number | null;
  contextSize: number | null;
  costUsd: number | null;
}

export interface TaskState {
  schemaVersion: 2;
  taskId: string;
  goal: string;
  atSeq: number;
  status: TaskStateStatus;
  completed: string[];
  currentStep: string | null;
  nextStep: string | null;
  remaining: string[];
  decisions: Decision[];
  discoveries: Discovery[];
  changedFiles: ChangedFiles;
  filesRead: string[];
  failures: Failure[];
  verification: VerificationResult[];
  commands: CommandResult[];
  openQuestions: OpenQuestion[];
  dependencies: TaskDependencyRef[];
  contextVersion: number | null;
  gitState: GitState;
  engineState: EngineState;
  inFlight: ToolCallRef[];
}

export interface TaskStateV1 {
  schemaVersion: 1;
  taskId: string;
  goal: string;
  atSeq: number;
  completed: string[];
  inProgress: { description: string } | null;
  remaining: string[];
  files: { read: string[]; modified: string[]; created: string[]; deleted: string[] };
  commands: CommandResult[];
  verification: VerificationResult[];
  decisions: Decision[];
  errors: ErrorRecord[];
  inFlight: ToolCallRef[];
  git: GitState;
}
