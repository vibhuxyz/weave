import type { PoolReport } from "../pool/index.ts";
import { flatten } from "../shared/index.ts";
import { MAX_TRIGGER_DETAIL_CHARS, MAX_TRIGGERS } from "./constants.ts";
import type { ReplanTrigger } from "./types.ts";

const NO_REASON = "no reason recorded";

function detailOf(text: string | null): string {
  return flatten(text ?? NO_REASON).slice(0, MAX_TRIGGER_DETAIL_CHARS);
}

function settledTriggers(pool: PoolReport): readonly ReplanTrigger[] {
  return pool.tasks.flatMap((entry): readonly ReplanTrigger[] => {
    if (entry.status === "ok") return [];
    if (entry.status === "skipped") return [{ kind: "worker-skipped", taskId: entry.taskId, detail: detailOf(entry.reason) }];
    const settledAs = entry.isRejected ? "rejected" : entry.status;
    return [{ kind: "worker-failed", taskId: entry.taskId, detail: `${settledAs}: ${detailOf(entry.reason)}` }];
  });
}

function dependencyTriggers(pool: PoolReport): readonly ReplanTrigger[] {
  const settled = new Map(pool.tasks.map((entry) => [entry.taskId, entry.status]));
  return pool.coordination.addedDependencies.flatMap((edge): readonly ReplanTrigger[] => {
    if (settled.get(edge.taskId) === "ok") return [];
    const outputs = edge.dependency.requiredOutputs.join(", ") || "everything it produces";
    return [{ kind: "dependency-discovered", taskId: edge.taskId, detail: `needs ${outputs} from ${edge.dependency.task}` }];
  });
}

function escalationTriggers(pool: PoolReport): readonly ReplanTrigger[] {
  return pool.coordination.escalations.flatMap((event): readonly ReplanTrigger[] => {
    if (event.type !== "escalation.created" && event.type !== "review.requested") return [];
    const detail = event.type === "escalation.created" ? `${event.data.subject}: ${event.data.reason}` : event.data.summary;
    return [{ kind: "escalation", taskId: event.from, detail: detailOf(detail) }];
  });
}

export function replanTriggers(pool: PoolReport): readonly ReplanTrigger[] {
  return [...settledTriggers(pool), ...dependencyTriggers(pool), ...escalationTriggers(pool)].slice(0, MAX_TRIGGERS);
}
