import type { WeaveEvent } from "@weave/protocol";
import type { RunUpdate } from "../shared/index.ts";
import { MAX_CLAIMS_SHOWN, MAX_DETAIL_CHARS, MAX_REASONS } from "./constants.ts";
import { coordinationUpdate, flattened } from "./coordination-update.ts";

function cappedList(items: readonly string[], maxItems: number): readonly string[] {
  const hidden = items.length - maxItems;
  return hidden > 0 ? [...items.slice(0, maxItems), `(+${hidden} more)`] : items;
}

export function workforceUpdate(event: WeaveEvent): RunUpdate | null {
  switch (event.type) {
    case "employee.assigned":
      return { kind: "employee-assigned", taskId: event.taskId, employeeId: event.employeeId, reasons: cappedList(event.reasons.map((reason) => flattened(reason)), MAX_REASONS) };
    case "employee.verified":
      return { kind: "employee-verified", taskId: event.taskId, ok: event.ok, rungs: event.rungs.map(({ rung, ok }) => ({ rung, ok })), detail: flattened(event.detail, MAX_DETAIL_CHARS) };
    case "ownership.claimed":
      return { kind: "claimed", taskId: event.taskId, resources: cappedList(event.resources.map((resource) => `${resource.kind}:${flattened(resource.id)}`), MAX_CLAIMS_SHOWN) };
    case "ownership.blocked":
      return { kind: "blocked", taskId: event.taskId, reason: flattened(`Waiting for ${event.conflicts.join(", ")}`) };
    case "dependency.added":
      return { kind: "dependency-added", taskId: event.taskId, on: event.on, reason: flattened(event.reason) };
    case "consumer.invalidated":
      return { kind: "note", taskId: event.taskId, tone: "warning", text: flattened(`Invalidated: ${event.reason}`) };
    case "coordination.rejected":
      return { kind: "note", taskId: event.taskId, tone: "warning", text: flattened(`Coordination event rejected: ${event.reason}`) };
    case "coordination.event":
      return coordinationUpdate(event.event);
    case "orchestration.decided":
      return { kind: "orchestration", workers: event.workers, reason: flattened(event.reason), estimatedCostMicroUsd: event.estimatedCostMicroUsd, timeSavedMs: event.benefitMs.timeSaved };
    case "budget.exceeded":
      return { kind: "budget-exceeded", alert: { scope: event.scope, key: flattened(event.key), dimension: event.dimension, limit: event.limit, spent: event.spent, action: event.action } };
    default:
      return null;
  }
}
