import type { CommitSummary, ProjectModel } from "../types.ts";

const MAX_NEIGHBOURS = 20;
const MAX_CHANGES = 8;

function capped(values: Iterable<string>): readonly string[] {
  return [...new Set(values)].sort().slice(0, MAX_NEIGHBOURS);
}

export function fileNeighbours(model: ProjectModel, files: ReadonlySet<string>): { readonly imports: readonly string[]; readonly dependents: readonly string[] } {
  const edges = model.dependencies.internal;
  const tests = new Set(model.files.filter((file) => file.kind === "test").map((file) => file.path));
  return {
    imports: capped(edges.filter((edge) => files.has(edge.from) && !files.has(edge.to)).map((edge) => edge.to)),
    dependents: capped(edges.filter((edge) => files.has(edge.to) && !files.has(edge.from) && !tests.has(edge.from)).map((edge) => edge.from)),
  };
}

function fileOf(id: string): string {
  return id.split("#")[0] ?? id;
}

export function callNeighbours(model: ProjectModel, symbolIds: ReadonlySet<string>, files: ReadonlySet<string>): { readonly callers: readonly string[]; readonly callees: readonly string[] } {
  const isRelevant = (id: string) => symbolIds.has(id);
  const calls = model.dependencies.calls;
  return {
    callers: capped(calls.filter((call) => isRelevant(call.to) && !files.has(fileOf(call.from))).map((call) => call.from)),
    callees: capped(calls.filter((call) => (isRelevant(call.from) || files.has(call.from)) && !isRelevant(call.to) && !files.has(fileOf(call.to))).map((call) => call.to)),
  };
}

export function changesTouching(model: ProjectModel, files: ReadonlySet<string>): readonly CommitSummary[] {
  return model.recentChanges
    .filter((commit) => commit.files.some((file) => files.has(file)))
    .slice(0, MAX_CHANGES)
    .map((commit) => ({ ...commit, files: commit.files.filter((file) => files.has(file)) }));
}
