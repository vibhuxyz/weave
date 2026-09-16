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
  | (BaseEvent & { type: "worktree.removed"; taskId: string; path: string });

export type WeaveEventType = WeaveEvent["type"];
