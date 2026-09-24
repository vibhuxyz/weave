import type { CoordinationEvent, ResourceRef } from "../coordination/index.ts";
import type { CheckpointReason } from "../continuation/index.ts";
import type { VerificationRung } from "../verification/index.ts";

export type EventSeq = number;

interface BaseEvent {
  runId: string;
  seq: EventSeq;
  at: string;
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
  | (BaseEvent & { type: "engine.capabilities"; engineId: string; capabilities: unknown })
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
  | (BaseEvent & {
      type: "intake.detected";
      cwd: string;
      isGitRepo: boolean;
      head: string | null;
      available: VerificationRung[];
      missing: Array<{ rung: VerificationRung; why: string }>;
    })
  | (BaseEvent & {
      type: "verification.rung";
      rung: VerificationRung;
      strength: number;
      command: string;
      ok: boolean;
      wallMs: number;
      output?: string;
    })
  | (BaseEvent & {
      type: "verification.finished";
      ok: boolean;
      available: VerificationRung[];
      used: VerificationRung[];
      strength: number;
    })
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
      strength: number;
      used: VerificationRung[];
    })
  | (BaseEvent & {
      type: "plugin.activated";
      pluginId: string;
      version: string;
      contentHash: string;
      engineId: string;
      model: string;
      mode: "always" | "manual";
      activatedCapabilities: string[];
      unsupportedCapabilities: string[];
    })
  | (BaseEvent & { type: "file.read"; path: string })
  | (BaseEvent & { type: "file.written"; path: string; bytes: number })
  | (BaseEvent & { type: "error"; message: string; where: string })
  | (BaseEvent & {
      type: "attempt.started";
      taskId: string;
      attemptIndex: number;
      engineId: string;
      sessionId: string;
    })
  | (BaseEvent & {
      type: "attempt.ended";
      taskId: string;
      attemptIndex: number;
      endedBy: CheckpointReason;
    })
  | (BaseEvent & {
      type: "checkpoint.created";
      taskId: string;
      checkpointId: string;
      atSeq: number;
      reason: CheckpointReason;
    })
  | (BaseEvent & {
      type: "worktree.created";
      taskId: string;
      path: string;
      branch: string;
      baseCommit: string;
    })
  | (BaseEvent & { type: "worktree.removed"; taskId: string; path: string })
  | (BaseEvent & {
      type: "worktree.installed";
      taskId: string;
      status: "ok" | "failed" | "skipped";
      command: string | null;
      durationMs: number;
      detail: string;
    })
  | (BaseEvent & { type: "worktree.harvested"; taskId: string; commit: string | null; files: string[] })
  | (BaseEvent & { type: "task.skipped"; taskId: string; reason: string })
  | (BaseEvent & { type: "contract.changed"; version: number; requestedBy: string; affects: string[]; rerun: string[]; commit: string })
  | (BaseEvent & { type: "contract.change.rejected"; requestedBy: string; reason: string })
  | (BaseEvent & {
      type: "plan.created";
      kind: "existing" | "greenfield";
      mode: "sequential" | "parallel";
      reason: string;
      concurrency: number;
      tasks: { id: string; title: string; allowedPaths: string[]; dependsOn: string[] }[];
    })
  | (BaseEvent & {
      type: "pool.task.settled";
      taskId: string;
      status: "ok" | "failed" | "cancelled";
      reason: string | null;
      installMs: number;
      agentMs: number;
      wallMs: number;
    })
  | (BaseEvent & {
      type: "merge.finished";
      taskId: string;
      status: "merged" | "empty" | "conflict" | "merge-error" | "verify-failed";
      commit: string | null;
      rungs: VerificationRung[];
      detail: string;
      verifyMs?: number;
    })
  | (BaseEvent & {
      type: "integration.finished";
      status: "ok" | "failed" | "unverified";
      branch: string;
      head: string;
      brokenBy: string | null;
    })
  | (BaseEvent & { type: "coordination.event"; event: CoordinationEvent; recipients: string[] })
  | (BaseEvent & { type: "coordination.rejected"; taskId: string; reason: string })
  | (BaseEvent & { type: "ownership.claimed"; taskId: string; resources: ResourceRef[] })
  | (BaseEvent & { type: "ownership.blocked"; taskId: string; conflicts: string[] })
  | (BaseEvent & { type: "ownership.released"; taskId: string })
  | (BaseEvent & { type: "dependency.added"; taskId: string; on: string; outputs: string[]; reason: string })
  | (BaseEvent & { type: "consumer.invalidated"; taskId: string; reason: string })
  | (BaseEvent & {
      type: "orchestration.decided";
      workers: number;
      reason: string;
      benefitMs: { timeSaved: number; coordination: number; mergeRisk: number; verification: number; startup: number; total: number };
      estimatedCostMicroUsd: string;
      tasks: { taskId: string; kind: string; sizeUnits: number; engines: string[]; estimatedMs: number }[];
    })
  | (BaseEvent & {
      type: "budget.exceeded";
      scope: "project" | "run" | "task" | "employee" | "engine";
      key: string;
      dimension: "cost" | "tokens" | "time";
      limit: string;
      spent: string;
      action: "stop-task" | "stop-run" | "skip-task";
    });

export type WeaveEventType = WeaveEvent["type"];
