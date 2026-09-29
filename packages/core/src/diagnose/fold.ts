import type { WeaveEvent } from "@weave/protocol";
import type { RunDiagnosis, TaskDiagnosis } from "./types.ts";

const UNKNOWN_STATUS = "did not finish";
const MAX_SLOWEST = 5;

interface Draft {
  taskId: string;
  status: string;
  reason: string | null;
  attempts: number;
  engines: Set<string>;
  installMs: number;
  agentMs: number;
  wallMs: number;
  toolCalls: number;
  filesWritten: number;
  costUsd: number;
  verifications: { rung: string; ok: boolean; wallMs: number }[];
  timeouts: { reason: string; turns: number; wallMs: number }[];
  errors: { where: string; message: string }[];
}

function draftFor(drafts: Map<string, Draft>, taskId: string): Draft {
  const existing = drafts.get(taskId);
  if (existing) return existing;
  const fresh: Draft = {
    taskId,
    status: UNKNOWN_STATUS,
    reason: null,
    attempts: 0,
    engines: new Set(),
    installMs: 0,
    agentMs: 0,
    wallMs: 0,
    toolCalls: 0,
    filesWritten: 0,
    costUsd: 0,
    verifications: [],
    timeouts: [],
    errors: [],
  };
  drafts.set(taskId, fresh);
  return fresh;
}

function isToolCall(event: Extract<WeaveEvent, { type: "agent.message" }>): boolean {
  const update = event.update;
  if (typeof update !== "object" || update === null || !("sessionUpdate" in update)) return false;
  return update.sessionUpdate === "tool_call";
}

function applyTaskEvent(drafts: Map<string, Draft>, event: WeaveEvent, taskId: string): void {
  const task = draftFor(drafts, taskId);
  switch (event.type) {
    case "attempt.started":
      task.attempts += 1;
      task.engines.add(event.engineId);
      return;
    case "pool.task.settled":
      task.status = event.status;
      task.reason = event.reason;
      task.installMs = event.installMs;
      task.agentMs = event.agentMs;
      task.wallMs = event.wallMs;
      return;
    case "task.skipped":
      task.status = "skipped";
      task.reason = event.reason;
      return;
    case "worktree.installed":
      task.installMs = Math.max(task.installMs, event.durationMs);
      return;
    case "verification.rung":
      task.verifications.push({ rung: event.rung, ok: event.ok, wallMs: event.wallMs });
      return;
    case "task.timeout":
      task.timeouts.push({ reason: event.reason, turns: event.turns, wallMs: event.wallMs });
      return;
    case "error":
      task.errors.push({ where: event.where, message: event.message });
      return;
    case "file.written":
      task.filesWritten += 1;
      return;
    case "usage":
      task.costUsd += event.costUsd ?? 0;
      return;
    case "agent.message":
      if (isToolCall(event)) task.toolCalls += 1;
      return;
    default:
      return;
  }
}

function finish(draft: Draft): TaskDiagnosis {
  return {
    ...draft,
    engines: [...draft.engines].sort(),
    verifications: draft.verifications,
    timeouts: draft.timeouts,
    errors: draft.errors,
  };
}

export function diagnoseRun(events: readonly WeaveEvent[]): RunDiagnosis {
  const drafts = new Map<string, Draft>();
  const runErrors: { where: string; message: string }[] = [];
  let runId = "";
  let wallMs = 0;
  let status = UNKNOWN_STATUS;

  for (const event of events) {
    runId = event.runId;
    if (event.type === "run.finished") {
      status = event.status;
      wallMs = event.wallMs;
    }
    if (event.taskId === undefined) {
      if (event.type === "error") runErrors.push({ where: event.where, message: event.message });
      continue;
    }
    applyTaskEvent(drafts, event, event.taskId);
  }

  const tasks = [...drafts.values()].map(finish).sort((a, b) => a.taskId.localeCompare(b.taskId));
  return {
    runId,
    wallMs,
    status,
    tasks,
    failed: tasks.filter((task) => task.status !== "ok"),
    slowest: [...tasks].sort((a, b) => b.wallMs - a.wallMs).slice(0, MAX_SLOWEST),
    runErrors,
    costUsd: tasks.reduce((total, task) => total + task.costUsd, 0),
    eventCount: events.length,
  };
}
