import { WEAVE_SENDER, type Artifact, type CoordinationEvent } from "@weave/protocol";
import type { DependentsOf } from "./types.ts";

function consumersOfArtifact(event: CoordinationEvent, artifact: Artifact, dependentsOf: DependentsOf): readonly string[] {
  const carried = new Set([artifact.name, ...artifact.provides]);
  return dependentsOf(event.from)
    .filter((dependent) => dependent.requiredOutputs.length === 0 || dependent.requiredOutputs.some((output) => carried.has(output)))
    .map((dependent) => dependent.consumer);
}

function allConsumers(event: CoordinationEvent, dependentsOf: DependentsOf): readonly string[] {
  return dependentsOf(event.from).map((dependent) => dependent.consumer);
}

function candidates(event: CoordinationEvent, dependentsOf: DependentsOf): readonly string[] {
  switch (event.type) {
    case "artifact.ready":
    case "artifact.updated":
    case "contract.published":
    case "contract.changed":
      return consumersOfArtifact(event, event.data.artifact, dependentsOf);
    case "task.started":
    case "task.blocked":
    case "task.completed":
    case "verification.failed":
    case "verification.passed":
      return allConsumers(event, dependentsOf);
    case "dependency.ready":
    case "dependency.resolved":
      return [event.data.consumer];
    case "dependency.blocked":
      return event.data.need.task ? [event.data.need.task, WEAVE_SENDER] : [WEAVE_SENDER];
    case "scope.expand":
    case "split.suggested":
      return [WEAVE_SENDER];
    case "scope.granted":
    case "scope.denied":
      return [event.data.taskId];
    case "subtask.completed":
    case "review.requested":
    case "escalation.created":
      return [WEAVE_SENDER];
    default: {
      const unhandled: never = event;
      return unhandled;
    }
  }
}

export function recipientsFor(event: CoordinationEvent, dependentsOf: DependentsOf): readonly string[] {
  return [...new Set(candidates(event, dependentsOf))].filter((recipient) => recipient === WEAVE_SENDER || recipient !== event.from).sort();
}
