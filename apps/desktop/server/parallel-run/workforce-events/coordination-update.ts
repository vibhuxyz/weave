import type { WeaveEvent } from "@weave/protocol";
import type { NoteTone, RunArtifactKind, RunUpdate } from "../../shared/index.ts";
import { MAX_DETAIL_CHARS, MAX_NAME_CHARS, MAX_NOTE_CHARS } from "../constants.ts";

type CoordinationEvent = Extract<WeaveEvent, { type: "coordination.event" }>["event"];

export function flattened(text: string, maxChars: number = MAX_NOTE_CHARS): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= maxChars ? flat : flat.slice(0, maxChars);
}

function note(taskId: string, tone: NoteTone, text: string): RunUpdate {
  return { kind: "note", taskId, tone, text: flattened(text) };
}

const ARTIFACT_KINDS: Readonly<Record<"artifact.ready" | "artifact.updated" | "contract.published" | "contract.changed", { readonly kind: RunArtifactKind; readonly isUpdate: boolean }>> = {
  "artifact.ready": { kind: "artifact", isUpdate: false },
  "artifact.updated": { kind: "artifact", isUpdate: true },
  "contract.published": { kind: "contract", isUpdate: false },
  "contract.changed": { kind: "contract", isUpdate: true },
};

export function coordinationUpdate(event: CoordinationEvent): RunUpdate | null {
  const taskId = event.from;
  switch (event.type) {
    case "task.blocked":
      return { kind: "blocked", taskId, reason: flattened(event.data.reason) };
    case "dependency.blocked": {
      const { need, reason } = event.data;
      return { kind: "awaiting", taskId, output: flattened(need.output, MAX_NAME_CHARS), producer: need.task ?? null, reason: flattened(reason) };
    }
    case "dependency.resolved": {
      const { consumer, producer, output } = event.data;
      return { kind: "awaited-arrived", taskId: consumer, output: flattened(output, MAX_NAME_CHARS), producer };
    }
    case "dependency.ready":
      return event.data.outputs.length > 0
        ? note(event.data.consumer, "info", `Inputs ready: ${event.data.outputs.join(", ")}`)
        : note(event.data.consumer, "info", `Started ahead of its inputs: ${event.data.pending.join(", ")}`);
    case "subtask.completed":
      return { kind: "subtask", taskId, subtask: flattened(event.data.subtask), index: event.data.index };
    case "artifact.ready":
    case "artifact.updated":
    case "contract.published":
    case "contract.changed": {
      const { artifact } = event.data;
      return {
        kind: "artifact",
        taskId,
        artifact: { name: flattened(artifact.name, MAX_NAME_CHARS), version: artifact.version, summary: flattened(artifact.summary, MAX_DETAIL_CHARS), ...ARTIFACT_KINDS[event.type] },
      };
    }
    case "scope.expand":
      return note(taskId, "info", `Asked to also work on ${event.data.paths.join(", ")}: ${flattened(event.data.reason)}`);
    case "scope.granted":
      return note(event.data.taskId, "info", `Scope widened to ${event.data.paths.join(", ")}`);
    case "scope.denied":
      return note(event.data.taskId, "warning", `Scope not widened to ${event.data.paths.join(", ")}: ${flattened(event.data.reason)}`);
    case "review.requested":
      return note(taskId, "info", `Review requested: ${event.data.summary}`);
    case "verification.passed":
      return note(taskId, "info", `Verification passed: ${event.data.summary}`);
    case "verification.failed":
      return note(taskId, "warning", `Verification failed: ${event.data.summary}`);
    case "escalation.created":
      return note(taskId, "warning", `Escalated: ${event.data.subject} (${event.data.reason})`);
    case "task.started":
    case "task.completed":
      return null;
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}
