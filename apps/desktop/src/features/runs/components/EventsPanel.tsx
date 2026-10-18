import { useShallow } from "zustand/react/shallow";
import { MAX_VISIBLE_EVENTS } from "../constants";
import { selectEvents, useRunStore } from "../store";

export function EventsPanel() {
  const { events, hiddenEventCount } = useRunStore(useShallow(selectEvents));
  if (events.length === 0) return null;
  const visible = events.slice(-MAX_VISIBLE_EVENTS);

  return (
    <section aria-label="Run events" className="flex flex-col gap-1 border-agent-border border-t pt-2">
      <span className="font-medium text-[11px] text-agent-text-muted">Events</span>
      <ul className="flex flex-col gap-0.5">
        {visible.map((event) => (
          <li key={event.id} className="flex min-w-0 items-baseline gap-2">
            <span className="shrink-0 font-mono text-[11px] text-agent-text-muted">{event.kind}</span>
            {event.taskId && <span className="shrink-0 text-[11px] text-agent-text-faint">{event.taskId}</span>}
            <span className="min-w-0 break-words text-[11px] text-agent-text-faint">{event.text}</span>
          </li>
        ))}
      </ul>
      {hiddenEventCount > 0 && <span className="text-[11px] text-agent-text-faint">(+{hiddenEventCount} earlier events)</span>}
    </section>
  );
}
