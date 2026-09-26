import type { RunArtifact } from "../../../../server/index.ts";
import type { RunArtifactEntry, RunState } from "../types";

function keyOf(producer: string, name: string): string {
  return `${producer}/${name}`;
}

export function withArtifact(run: RunState, producer: string, artifact: RunArtifact, maxEntries: number): RunState {
  const key = keyOf(producer, artifact.name);
  const known = run.artifacts.find((entry) => entry.key === key);
  if (known) {
    return { ...run, artifacts: run.artifacts.map((entry) => (entry.key === key ? { ...entry, artifact } : entry)) };
  }
  if (run.artifacts.length >= maxEntries) return { ...run, hiddenArtifactCount: run.hiddenArtifactCount + 1 };
  const entry: RunArtifactEntry = { key, producer, artifact, deliveredTo: [] };
  return { ...run, artifacts: [...run.artifacts, entry] };
}

export function withDelivery(run: RunState, consumer: string, output: string, producer: string): RunState {
  const matches = (entry: RunArtifactEntry): boolean =>
    entry.producer === producer && (entry.artifact.name === output || entry.key === keyOf(producer, output));
  if (!run.artifacts.some(matches)) return run;
  return {
    ...run,
    artifacts: run.artifacts.map((entry) =>
      matches(entry) && !entry.deliveredTo.includes(consumer) ? { ...entry, deliveredTo: [...entry.deliveredTo, consumer] } : entry,
    ),
  };
}
