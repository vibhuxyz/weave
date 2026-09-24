import type { WeaveEvent } from "@weave/protocol";
import type { NoteTone, RunUpdate } from "../shared/index.ts";
import { MAX_NOTE_CHARS } from "./constants.ts";

type CoordinationEvent = Extract<WeaveEvent, { type: "coordination.event" }>["event"];

export function flattened(text: string, maxChars: number = MAX_NOTE_CHARS): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= maxChars ? flat : flat.slice(0, maxChars);
}

function note(taskId: string, tone: NoteTone, text: string): RunUpdate {
  return { kind: "note", taskId, tone, text: flattened(text) };
}

export function coordinationUpdate(event: CoordinationEvent): RunUpdate | null {
  const taskId = event.from;
  switch (event.type) {
    case "task.blocked":
      return { kind: "blocked", taskId, reason: flattened(event.data.reason) };
    case "dependency.blocked": {
      const { need, reason } = event.data;
      return { kind: "blocked", taskId, reason: flattened(`Needs ${need.output}${need.task ? ` from ${need.task}` : ""}: ${reason}`) };
    }
    case "dependency.ready":
      return note(event.data.consumer, "info", `Can start early: ${event.data.outputs.join(", ")} ready from ${taskId}`);
    case "artifact.ready":
    case "artifact.updated":
      return note(taskId, "info", `${event.type === "artifact.ready" ? "Published" : "Updated"} artifact ${event.data.artifact.name} v${event.data.artifact.version}`);
    case "contract.published":
    case "contract.changed":
      return note(taskId, "info", `${event.type === "contract.published" ? "Published" : "Changed"} contract ${event.data.artifact.name} v${event.data.artifact.version}`);
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
    case "dependency.resolved":
      return null;
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}
