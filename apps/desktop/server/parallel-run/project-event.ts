import { ENGINES } from "@weave/agent";
import { realChecksOf } from "@weave/core";
import type { PlannedTaskFact, WeaveEvent } from "@weave/protocol";
import type { RunPlanTask, RunUpdate } from "../shared/index.ts";
import { MAX_CRITIQUE_ISSUES, MAX_EXECUTION_SLOTS, MAX_DETAIL_CHARS, MAX_DOMAINS, MAX_PLAN_NOTES, MAX_PLAN_WARNINGS, MAX_REPLAN_RERUNS, MAX_REPLAN_TRIGGERS, MAX_SCOPE_PATHS, MAX_TASK_OUTPUTS, MAX_TASK_SKILLS, MAX_TASK_SUBTASKS, MAX_TEXT_CHUNK_CHARS, MAX_WARNING_CHARS } from "./constants.ts";
import { toolCallOf, toolPatchOf } from "./tool-update.ts";
import { workforceUpdate } from "./workforce-events/index.ts";

type AgentMessageEvent = Extract<WeaveEvent, { type: "agent.message" }>;
type PlanReviewedEvent = Extract<WeaveEvent, { type: "plan.reviewed" }>;

function capped(text: string, maxChars: number): string {
  return text.length <= maxChars ? text : text.slice(0, maxChars);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

function chunkText(update: Readonly<Record<string, unknown>>): string | null {
  const content = update.content;
  if (!isRecord(content) || content.type !== "text" || typeof content.text !== "string") return null;
  return content.text;
}

function projectAgentMessage(event: AgentMessageEvent, taskId: string): RunUpdate | null {
  const update = event.update;
  if (!isRecord(update)) return null;
  if (update.sessionUpdate === "agent_message_chunk") {
    const text = chunkText(update);
    return text ? { kind: "text", taskId, text: capped(text, MAX_TEXT_CHUNK_CHARS) } : null;
  }
  if (update.sessionUpdate === "agent_thought_chunk") {
    const text = chunkText(update);
    return text ? { kind: "thought", taskId, text: capped(text, MAX_TEXT_CHUNK_CHARS) } : null;
  }
  if (update.sessionUpdate === "tool_call") {
    const tool = toolCallOf(update);
    return tool === null ? null : { kind: "tool", taskId, tool };
  }
  if (update.sessionUpdate === "tool_call_update") {
    const tool = toolPatchOf(update);
    return tool === null ? null : { kind: "tool-update", taskId, tool };
  }
  return null;
}

function projectTaskEvent(event: WeaveEvent, taskId: string): RunUpdate | null {
  switch (event.type) {
    case "task.started":
      return { kind: "task-started", taskId };
    case "agent.message":
      return projectAgentMessage(event, taskId);
    case "file.written":
      return { kind: "file", taskId, path: event.path, change: "modified" };
    case "file.created":
      return { kind: "file", taskId, path: event.path, change: "created" };
    case "file.modified":
      return { kind: "file", taskId, path: event.path, change: "modified" };
    case "file.deleted":
      return { kind: "file", taskId, path: event.path, change: "deleted" };
    case "worker.progress":
      return { kind: "activity", taskId, activity: capped(event.activity, MAX_DETAIL_CHARS) };
    case "task.retrying":
      return { kind: "activity", taskId, activity: capped(`Retry ${event.attempt} of ${event.maxAttempts} in ${Math.round(event.delayMs / 1000)}s: ${event.reason}`, MAX_DETAIL_CHARS) };
    case "task.waiting":
      return { kind: "blocked", taskId, reason: capped(event.reason, MAX_DETAIL_CHARS) };
    case "verification.rung":
      return { kind: "verifying", taskId, rung: event.rung };
    case "usage":
      return event.costUsd === undefined ? null : { kind: "cost", taskId, costUsd: event.costUsd };
    case "pool.task.settled":
      return { kind: "task-settled", taskId, status: event.rejected ? "rejected" : event.status, reason: event.reason && capped(event.reason, MAX_DETAIL_CHARS), wallMs: event.wallMs, installMs: event.installMs };
    case "merge.finished":
      return { kind: "merge", taskId, status: event.status, checks: [...realChecksOf(event.rungs)], detail: capped(event.detail, MAX_DETAIL_CHARS) };
    default:
      return null;
  }
}

function engineLabel(engineId: string | null): string | null {
  return engineId === null ? null : ENGINES[engineId]?.label ?? engineId;
}

function projectPlanTask(task: PlannedTaskFact): RunPlanTask {
  return {
    id: task.id,
    title: task.title,
    dependsOn: task.dependsOn,
    ...(task.startsAfter ? { startsAfter: task.startsAfter.slice(0, MAX_SCOPE_PATHS) } : {}),
    allowedPaths: task.allowedPaths.slice(0, MAX_SCOPE_PATHS),
    ...(task.readOnlyPaths ? { readOnlyPaths: task.readOnlyPaths.slice(0, MAX_SCOPE_PATHS) } : {}),
    ...(task.produces ? { produces: task.produces.slice(0, MAX_TASK_OUTPUTS) } : {}),
    ...(task.subtasks ? { subtasks: task.subtasks.slice(0, MAX_TASK_SUBTASKS) } : {}),
    ...(task.skills ? { skills: task.skills.slice(0, MAX_TASK_SKILLS) } : {}),
    ...(task.complexity ? { complexity: task.complexity } : {}),
    ...(task.employee ? { employeeId: task.employee } : {}),
    ...(task.engine ? { engineId: task.engine } : {}),
    ...(task.verifyRung ? { verifyRung: task.verifyRung } : {}),
  };
}

function projectPlanReview(event: PlanReviewedEvent): RunUpdate {
  const { classification, critique } = event;
  return {
    kind: "plan-review",
    classification: classification && { ...classification, domains: classification.domains.slice(0, MAX_DOMAINS) },
    critique: critique && {
      outcome: critique.outcome,
      issues: critique.issues.slice(0, MAX_CRITIQUE_ISSUES).map((issue) => ({ type: issue.type, taskIds: issue.taskIds, reason: capped(issue.reason, MAX_WARNING_CHARS) })),
    },
    warnings: event.warnings.slice(0, MAX_PLAN_WARNINGS).map((warning) => capped(warning, MAX_WARNING_CHARS)),
    hiddenWarningCount: Math.max(0, event.warnings.length - MAX_PLAN_WARNINGS),
  };
}

export function projectRunEvent(event: WeaveEvent): RunUpdate | null {
  switch (event.type) {
    case "plan.created":
      return {
        kind: "plan",
        mode: event.mode,
        reason: event.reason,
        goal: event.goal && capped(event.goal, MAX_DETAIL_CHARS),
        assumptions: event.assumptions.slice(0, MAX_PLAN_NOTES).map((note) => capped(note, MAX_WARNING_CHARS)),
        risks: event.risks.slice(0, MAX_PLAN_NOTES).map((note) => capped(note, MAX_WARNING_CHARS)),
        tasks: event.tasks.map(projectPlanTask),
      };
    case "plan.workers":
      return {
        kind: "worker-count",
        count: {
          workers: event.workers,
          limitedBy: event.limitedBy,
          reason: capped(event.reason, MAX_DETAIL_CHARS),
          requested: event.requested,
          maxWorkers: event.maxWorkers,
          machineCapacity: event.machineCapacity,
          affordable: event.affordable,
        },
      };
    case "replan.requested":
      return {
        kind: "replan-requested",
        round: event.round,
        triggers: event.triggers.slice(0, MAX_REPLAN_TRIGGERS).map((trigger) => ({ kind: trigger.kind, taskId: trigger.taskId, detail: capped(trigger.detail, MAX_DETAIL_CHARS) })),
        hiddenTriggerCount: Math.max(0, event.triggers.length - MAX_REPLAN_TRIGGERS),
      };
    case "replan.decided":
      return {
        kind: "replan-decided",
        round: event.round,
        action: event.action,
        reason: capped(event.reason, MAX_DETAIL_CHARS),
        rerun: event.rerun.slice(0, MAX_REPLAN_RERUNS).map((entry) => ({ id: entry.id, engineId: entry.engine ?? null })),
        warnings: event.warnings.slice(0, MAX_PLAN_WARNINGS).map((warning) => capped(warning, MAX_WARNING_CHARS)),
      };
    case "plan.triaged":
      return event.route === "plan" ? { kind: "planning", planner: engineLabel(event.plannerEngineId), reviewer: engineLabel(event.reviewerEngineId) } : null;
    case "plan.reviewed":
      return projectPlanReview(event);
    case "plan.rejected":
      return {
        kind: "plan-rejected",
        reasons: event.reasons.slice(0, MAX_PLAN_WARNINGS).map((reason) => capped(reason, MAX_WARNING_CHARS)),
        hiddenReasonCount: Math.max(0, event.reasons.length - MAX_PLAN_WARNINGS),
        willRepair: event.willRepair,
      };
    case "plan.execution":
      return {
        kind: "execution-plan",
        plan: { workers: event.workers, timing: event.timing, estimatedMs: event.estimatedMs, estimatedCostMicroUsd: event.estimatedCostMicroUsd, slots: event.slots.slice(0, MAX_EXECUTION_SLOTS) },
      };
    case "contract.changed":
      return { kind: "contract-changed", version: event.version, requestedBy: event.requestedBy, rerun: event.rerun };
    case "integration.finished":
      return { kind: "integration", status: event.status, branch: event.branch, brokenBy: event.brokenBy };
    default:
      return workforceUpdate(event) ?? (event.taskId === undefined ? null : projectTaskEvent(event, event.taskId));
  }
}
