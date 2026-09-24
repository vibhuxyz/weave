import type { CoordinationEvent, WeaveEvent } from "@weave/protocol";
import type { RunUpdate } from "../shared/index.ts";
import { MAX_DETAIL_CHARS, MAX_ROUTED_TASKS } from "./constants.ts";

function flat(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length <= MAX_DETAIL_CHARS ? oneLine : oneLine.slice(0, MAX_DETAIL_CHARS);
}

function summarize(event: CoordinationEvent): string {
  switch (event.type) {
    case "artifact.ready":
    case "artifact.updated":
    case "contract.published":
    case "contract.changed":
      return `${event.data.artifact.name} v${event.data.artifact.version}: ${event.data.artifact.summary}`;
    case "task.started":
      return "started";
    case "task.completed":
      return event.data.status;
    case "task.blocked":
      return event.data.reason;
    case "dependency.ready":
      return `inputs ready for ${event.data.consumer}${event.data.outputs.length > 0 ? `: ${event.data.outputs.join(", ")}` : ""}`;
    case "dependency.blocked":
      return `needs ${event.data.need.output}${event.data.need.task ? ` from ${event.data.need.task}` : ""}: ${event.data.reason}`;
    case "dependency.resolved":
      return `${event.data.output} from ${event.data.producer} reached ${event.data.consumer}`;
    case "review.requested":
    case "verification.failed":
    case "verification.passed":
      return event.data.summary;
    case "escalation.created":
      return `${event.data.subject}: ${event.data.reason}`;
    default: {
      const unhandled: never = event;
      return unhandled;
    }
  }
}

export function projectWorkforceEvent(event: WeaveEvent): RunUpdate | null {
  switch (event.type) {
    case "employee.assigned":
      return { kind: "employee", taskId: event.taskId, employeeId: event.employeeId, reason: flat(event.reasons.join("; ")) };
    case "employee.verified":
      return { kind: "verification", taskId: event.taskId, employeeId: event.employeeId, ok: event.ok, detail: flat(event.detail) };
    case "coordination.event":
      return { kind: "coordination", taskId: event.event.from === "weave" ? null : event.event.from, event: event.event.type, summary: flat(summarize(event.event)), recipients: event.recipients.slice(0, MAX_ROUTED_TASKS) };
    case "ownership.blocked":
      return { kind: "blocked", taskId: event.taskId, reason: flat(event.conflicts.join("; ")) };
    case "orchestration.decided":
      return {
        kind: "decision",
        workers: event.workers,
        reason: flat(event.reason),
        benefitMs: event.benefitMs,
        estimatedCostMicroUsd: event.estimatedCostMicroUsd,
        routes: event.tasks.slice(0, MAX_ROUTED_TASKS).map((task) => ({ taskId: task.taskId, kind: task.kind, engines: task.engines, estimatedMs: task.estimatedMs })),
      };
    case "budget.exceeded":
      return { kind: "budget", taskId: event.taskId ?? null, scope: event.scope, key: event.key, dimension: event.dimension, limit: event.limit, spent: event.spent, action: event.action };
    default:
      return null;
  }
}
