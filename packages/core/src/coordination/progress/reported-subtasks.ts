import type { WeaveEvent } from "@weave/protocol";

export function reportedSubtasks(events: readonly WeaveEvent[], taskId: string): readonly string[] {
  const reported = events.flatMap((event) =>
    event.type === "coordination.event" && event.event.type === "subtask.completed" && event.event.from === taskId
      ? [event.event.data.subtask]
      : [],
  );
  return [...new Set(reported)];
}
