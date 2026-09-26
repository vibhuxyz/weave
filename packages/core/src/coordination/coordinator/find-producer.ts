import type { DependencyNeed, ResourceRef, TaskContract } from "@weave/protocol";

export interface ProducerLookup {
  readonly consumer: string;
  readonly need: DependencyNeed;
  readonly hasTask: (taskId: string) => boolean;
  readonly ownerOf: (resource: ResourceRef) => string | null;
  readonly publishersOf: (output: string) => readonly string[];
  readonly promisedProducersOf: (output: string) => readonly string[];
  readonly declaredProducersOf: (output: string) => readonly string[];
}

export type FindProducerResult =
  | { readonly ok: true; readonly producer: string }
  | { readonly ok: false; readonly reason: string };

function firstOther(candidates: readonly string[], consumer: string): string | null {
  return [...candidates].sort().find((candidate) => candidate !== consumer) ?? null;
}

export function findProducer(lookup: ProducerLookup): FindProducerResult {
  const { need, consumer } = lookup;
  if (need.task !== undefined) {
    return lookup.hasTask(need.task)
      ? { ok: true, producer: need.task }
      : { ok: false, reason: `No task ${need.task} in this run can provide ${need.output}` };
  }
  const owner = need.resource ? lookup.ownerOf(need.resource) : null;
  const producer = (owner !== consumer ? owner : null)
    ?? firstOther(lookup.publishersOf(need.output), consumer)
    ?? firstOther(lookup.promisedProducersOf(need.output), consumer)
    ?? firstOther(lookup.declaredProducersOf(need.output), consumer);
  return producer === null
    ? { ok: false, reason: `No task in this run owns or produces ${need.output}` }
    : { ok: true, producer };
}

export function promisedProducersOf(tasks: readonly TaskContract[], output: string): readonly string[] {
  return tasks.filter((task) => (task.produces ?? []).includes(output)).map((task) => task.id);
}

export function declaredProducersOf(tasks: readonly TaskContract[], output: string): readonly string[] {
  return tasks.flatMap((task) =>
    (task.dependencies ?? []).filter((dependency) => dependency.requiredOutputs.includes(output)).map((dependency) => dependency.task),
  );
}
