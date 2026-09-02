/**
 * The execution ledger schema.
 *
 * Every run appends these, one JSON object per line, to
 * `.berd/runs/<runId>/events.ndjson`. Nothing else is the source of truth:
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

export type BerdEvent =
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
    })
  | (BaseEvent & { type: "file.read"; path: string })
  | (BaseEvent & { type: "file.written"; path: string; bytes: number })
  | (BaseEvent & { type: "error"; message: string; where: string });

export type BerdEventType = BerdEvent["type"];
