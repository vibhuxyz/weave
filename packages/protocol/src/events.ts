/**
 * The execution ledger schema.
 *
 * Every run appends these, one JSON object per line, to
 * `.weave/runs/<runId>/events.ndjson`. Nothing else is the source of truth:
 * replay, cost accounting, "why did agent 4 touch that file", and the eval
 * harness are all readers over this file.
 *
 * Rules that keep it useful:
 *  - Append-only. Never rewrite a line.
 *  - Every event carries `runId`, `seq`, `at`, and (where applicable) `taskId`,
 *    so a multi-agent log can be split per task after the fact.
 *  - `agent.message` carries the RAW ACP payload. Deriving a nicer shape is a
 *    reader's job; throwing away the original is unrecoverable.
 */

import type { VerificationRung } from "./verification.ts";

export type EventSeq = number;

interface BaseEvent {
  runId: string;
  /** Monotonic per run, starting at 1. */
  seq: EventSeq;
  /** ISO-8601. */
  at: string;
  /** Absent for run-level events. */
  taskId?: string;
}

export type WeaveEvent =
  | (BaseEvent & {
      type: "run.started";
      cwd: string;
      prompt?: string;
      config: Record<string, unknown>;
    })
  | (BaseEvent & {
      type: "run.finished";
      status: "ok" | "failed" | "cancelled";
      wallMs: number;
    })
  | (BaseEvent & { type: "task.started"; cwd: string; prompt: string })
  | (BaseEvent & {
      type: "task.finished";
      status: "ok" | "failed" | "cancelled";
      stopReason?: string;
      wallMs: number;
    })
  | (BaseEvent & { type: "agent.spawned"; pid: number; entry: string })
  | (BaseEvent & {
      type: "agent.session";
      sessionId: string;
      resumed: boolean;
      configOptions: unknown[];
    })
  /** A raw ACP `session/update` notification, verbatim. */
  | (BaseEvent & { type: "agent.message"; update: unknown })
  | (BaseEvent & {
      type: "permission.requested";
      toolCall: string;
      options: Array<{ optionId: string; name: string; kind: string }>;
    })
  | (BaseEvent & {
      type: "permission.decided";
      toolCall: string;
      decision: "allow" | "reject";
      optionId?: string;
      reason: string;
    })
  | (BaseEvent & {
      type: "usage";
      /** Context window consumed / total, as the engine reports it. */
      used: number;
      size: number;
      costUsd?: number;
    })
  | (BaseEvent & {
      type: "task.timeout";
      reason: "maxTurns" | "timeoutMs";
      turns: number;
      wallMs: number;
    })
  /** What the ladder found in a repo, before anything ran. */
  | (BaseEvent & {
      type: "intake.detected";
      cwd: string;
      isGitRepo: boolean;
      head: string | null;
      available: VerificationRung[];
      /** Rungs the project does NOT support, and why. Reads as a to-do list. */
      missing: Array<{ rung: VerificationRung; why: string }>;
    })
  /**
   * One rung, run. Emitted per rung so a failing `build` is still visible when
   * the run is ultimately scored at `boot`.
   */
  | (BaseEvent & {
      type: "verification.rung";
      rung: VerificationRung;
      strength: number;
      command: string;
      ok: boolean;
      wallMs: number;
      /** Tail of combined output. Truncated — the full log is the tool's own. */
      output?: string;
    })
  /** The verdict: which rung actually validated the task. */
  | (BaseEvent & {
      type: "verification.finished";
      ok: boolean;
      available: VerificationRung[];
      used: VerificationRung[];
      /** max(rungStrength(used)), 0 when nothing ran. Never average across it. */
      strength: number;
    })
  /** One eval cell: fixture x config x repeat. Written by the harness. */
  | (BaseEvent & {
      type: "cell.finished";
      fixtureId: string;
      configId: string;
      repeat: number;
      status: string;
      wallMs: number;
      turns: number;
      filesChanged: string[];
      costUsd?: number;
      /** Which rung scored this cell. Bucketing key for the matrix. */
      strength: number;
      used: VerificationRung[];
    })
  | (BaseEvent & { type: "file.read"; path: string })
  | (BaseEvent & { type: "file.written"; path: string; bytes: number })
  | (BaseEvent & { type: "error"; message: string; where: string });

export type WeaveEventType = WeaveEvent["type"];
