import type { ArtifactType } from "../artifact/index.ts";
import type { WorkerStatus } from "../worker/index.ts";
import type { BaseEvent } from "./base.ts";

export type LifecycleEvent =
  | (BaseEvent & {
      type: "task.created";
      taskId: string;
      title: string;
      dependsOn: string[];
      allowedPaths: string[];
    })
  | (BaseEvent & { type: "task.waiting"; taskId: string; waitingFor: string[]; reason: string })
  | (BaseEvent & {
      type: "worker.started";
      workerId: string;
      taskId: string;
      engineId: string;
      workspace: string | null;
    })
  | (BaseEvent & {
      type: "worker.progress";
      workerId: string;
      activity: string;
      completedSteps: number;
      totalSteps: number | null;
    })
  | (BaseEvent & { type: "worker.waiting"; workerId: string; reason: string })
  | (BaseEvent & { type: "worker.completed"; workerId: string; status: WorkerStatus; wallMs: number })
  | (BaseEvent & {
      type: "artifact.created";
      artifactId: string;
      artifactType: ArtifactType;
      name: string;
      producer: string;
      version: number;
    })
  | (BaseEvent & {
      type: "artifact.ready";
      artifactId: string;
      name: string;
      version: number;
      provides: string[];
    })
  | (BaseEvent & { type: "artifact.requested"; requestedBy: string; output: string; producer: string | null })
  | (BaseEvent & { type: "dependency.blocked"; taskId: string; on: string; outputs: string[]; reason: string })
  | (BaseEvent & { type: "dependency.ready"; taskId: string; on: string; outputs: string[] })
  | (BaseEvent & { type: "file.created"; path: string; bytes: number })
  | (BaseEvent & { type: "file.modified"; path: string; bytes: number })
  | (BaseEvent & { type: "file.deleted"; path: string })
  | (BaseEvent & { type: "test.started"; command: string })
  | (BaseEvent & { type: "test.passed"; command: string; wallMs: number; total: number | null })
  | (BaseEvent & { type: "test.failed"; command: string; wallMs: number; failed: number | null; output: string })
  | (BaseEvent & { type: "integration.started"; branch: string; candidates: string[] })
  | (BaseEvent & {
      type: "scope.expanded";
      taskId: string;
      paths: string[];
      reason: string;
    })
  | (BaseEvent & {
      type: "split.suggested";
      taskId: string;
      areas: string[];
      reason: string;
    })
  | (BaseEvent & {
      type: "scope.denied";
      taskId: string;
      paths: string[];
      reason: string;
    })
  | (BaseEvent & {
      type: "discovery.questions";
      request: string;
      questions: { id: string; question: string; kind: string }[];
    })
  | (BaseEvent & {
      type: "discovery.scoped";
      questionId: string;
      taskId: string;
      files: string[];
      symbols: string[];
      inherited: boolean;
    })
  | (BaseEvent & {
      type: "finding.recorded";
      questionId: string;
      worker: string;
      findingId: string;
      confidence: string;
      evidence: { file: string; symbol: string | null }[];
    })
  | (BaseEvent & {
      type: "finding.rejected";
      questionId: string;
      worker: string;
      reason: string;
    })
  | (BaseEvent & {
      type: "rootcause.proposed";
      hypothesis: string;
      score: number;
      supportedBy: string[];
      unanswered: string[];
    });
