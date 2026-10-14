import type { RunUpdate } from "../../../../server/index.ts";
import type { RunEventEntry, RunState } from "../types";

const IGNORED: ReadonlySet<RunUpdate["kind"]> = new Set(["text", "thought", "tool", "tool-update", "cost"]);

function textOf(update: RunUpdate): string {
  switch (update.kind) {
    case "file":
      return `${update.change} ${update.path}`;
    case "activity":
      return update.activity;
    case "verifying":
      return `running ${update.rung}`;
    case "artifact":
      return `${update.artifact.name} v${update.artifact.version}`;
    case "awaiting":
      return `waiting for ${update.output}`;
    case "awaited-arrived":
      return `${update.output} arrived from ${update.producer}`;
    case "task-settled":
      return update.status;
    case "merge":
      return `${update.status}`;
    case "subtask":
      return update.subtask;
    case "integration":
      return `${update.status} on ${update.branch}`;
    case "note":
      return update.text;
    case "plan-rejected":
      return update.reasons.join("; ");
    case "repo-setup":
    case "result-decision":
      return update.summary;
    default:
      return update.kind;
  }
}

export function withEvent(
  run: RunState,
  update: RunUpdate,
  maxEntries: number,
): Pick<RunState, "events" | "hiddenEventCount"> {
  if (IGNORED.has(update.kind)) return { events: run.events, hiddenEventCount: run.hiddenEventCount };
  const taskId = "taskId" in update ? update.taskId : null;
  const entry: RunEventEntry = {
    id: run.events.length + run.hiddenEventCount,
    kind: update.kind,
    taskId,
    text: textOf(update),
  };
  const events = [...run.events, entry];
  if (events.length <= maxEntries) return { events, hiddenEventCount: run.hiddenEventCount };
  return { events: events.slice(events.length - maxEntries), hiddenEventCount: run.hiddenEventCount + 1 };
}
