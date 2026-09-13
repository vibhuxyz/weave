/**
 * A unit of work that outlives any single engine, session, or process.
 *
 * See `docs/CONTINUATION.md`. This file is types only, zero runtime deps —
 * same as every other file in this package. Slice 1 of that doc: task
 * identity survives a stop. `TaskState`/`Checkpoint`/`HandoffContext` move
 * here in later slices.
 */

import type { VerificationRung } from "./verification.ts";

/** Why an attempt ended / a checkpoint was written. The first six are
 * terminal — always checkpoint. The last three are milestones — checkpoint
 * only when state actually moved. */
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

/** A task's lifecycle. Set by whichever attempt is currently open, or the
 * last one to close. */
export type TaskRecordStatus = "running" | "paused" | "completed" | "failed";

/** One (engine, session) binding. A switch ends one attempt and starts
 * another — never mutated after `seqEnd`/`endedBy` are set. */
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
  /** The user's original request, verbatim. Never summarised, never rewritten. */
  goal: string;
  cwd: string;
  status: TaskRecordStatus;
  createdAt: string;
  updatedAt: string;
  attempts: Attempt[];
  /** Filename under checkpoints/, or null before the first one. */
  latestCheckpoint: string | null;
}

// ---------------------------------------------------------------------------
// TaskState — the fold's output (§4, §6)
// ---------------------------------------------------------------------------

export interface CommandResult {
  command: string;
  ok: boolean;
  wallMs: number;
  /** Tail of combined output, as recorded on the ledger event. */
  output?: string;
}

export interface VerificationResult {
  rung: VerificationRung;
  status: "passed" | "failed";
  wallMs: number;
}

/** Rank 3 (§3): a model's claim, never a fact. Always rendered under a
 * heading that says so — see `claimed` below, kept on the type rather than a
 * comment so nothing can forget it. */
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

/** A tool call that started and never reached a terminal status before the
 * fold's high-water mark. See CONTINUATION.md §7 — the thing a transcript
 * dump cannot tell you. */
export interface ToolCallRef {
  toolCallId: string;
  title: string;
  kind?: string;
  locations: string[];
  startedAtSeq: number;
}

/** Rank-1 evidence (§3). Populated by `readGitStatus` in the Stop sequence
 * (§8 step 3, Slice 4) — `foldTaskState` has no I/O, so this stays at its
 * empty default through the fold and through `writeCheckpoint` (Slice 3),
 * and is merged in by the caller before persisting. */
export interface GitState {
  branch: string | null;
  baseCommit: string | null;
  headCommit: string | null;
  dirty: string[];
}

export const EMPTY_GIT_STATE: GitState = {
  branch: null,
  baseCommit: null,
  headCommit: null,
  dirty: [],
};

export interface TaskState {
  schemaVersion: 1;
  taskId: string;
  /** The user's original request, verbatim — same value as `TaskRecord.goal`. */
  goal: string;
  /** The fold's high-water mark: the last event seq folded into this state. */
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
  /** Rank 3 — see {@link Decision}. May direct attention; may never authorise
   * skipping work (§3). */
  decisions: Decision[];
  errors: ErrorRecord[];
  inFlight: ToolCallRef[];
  git: GitState;
}
