import type { CoordinationEvent } from "@weave/protocol";

export function latestByOutput(events: Iterable<CoordinationEvent>, producer: string): ReadonlyMap<string, CoordinationEvent> {
  const latest = new Map<string, CoordinationEvent>();
  for (const event of events) {
    if (event.from !== producer || !("artifact" in event.data)) continue;
    for (const output of [event.data.artifact.name, ...event.data.artifact.provides]) {
      const known = latest.get(output);
      if (!known || event.seq > known.seq) latest.set(output, event);
    }
  }
  return latest;
}
