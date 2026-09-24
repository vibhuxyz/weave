import type { ProjectModel } from "../types.ts";
import type { ImpactReport, ImpactTargets } from "./types.ts";
import { reachBackwards, reverseIndex } from "./walk-graph.ts";

const MAX_DEPTH = 3;
const MAX_ITEMS = 200;

function fileOf(id: string): string {
  return id.split("#")[0] ?? id;
}

export function analyzeImpact(model: ProjectModel, targets: ImpactTargets): ImpactReport {
  const symbols = [...new Set(targets.symbols ?? [])].sort();
  const files = [...new Set([...(targets.files ?? []), ...symbols.map(fileOf)])].sort();
  const changedSymbolIds = symbols.length > 0 ? symbols : model.symbols.filter((symbol) => files.includes(symbol.file)).map((symbol) => symbol.id);
  const dependents = reachBackwards(files, reverseIndex(model.dependencies.internal), MAX_DEPTH, MAX_ITEMS);
  const callers = reachBackwards(changedSymbolIds, reverseIndex(model.dependencies.calls), MAX_DEPTH, MAX_ITEMS);
  const touched = new Set([...files, ...dependents.reached.map((entry) => entry.id), ...callers.reached.map((entry) => fileOf(entry.id))]);
  const kinds = new Map(model.files.map((file) => [file.path, file]));
  return {
    files,
    symbols: changedSymbolIds,
    dependents: dependents.reached,
    callers: callers.reached,
    apis: model.apis.filter((api) => touched.has(api.file) && kinds.get(api.file)?.kind !== "test"),
    tests: [...touched].filter((path) => kinds.get(path)?.kind === "test").sort(),
    workspaces: [...new Set([...touched].flatMap((path) => kinds.get(path)?.workspace ?? []))].sort(),
    isTruncated: dependents.isTruncated || callers.isTruncated,
  };
}
