import type { ProjectModel } from "../types.ts";
import type { ModelDelta } from "./types.ts";

function keyed<T>(items: readonly T[], key: (item: T) => string, value: (item: T) => string): ReadonlyMap<string, string> {
  return new Map(items.map((item) => [key(item), value(item)]));
}

function compare(before: ReadonlyMap<string, string>, after: ReadonlyMap<string, string>): { readonly added: readonly string[]; readonly removed: readonly string[]; readonly changed: readonly string[] } {
  return {
    added: [...after.keys()].filter((key) => !before.has(key)).sort(),
    removed: [...before.keys()].filter((key) => !after.has(key)).sort(),
    changed: [...after].filter(([key, value]) => before.has(key) && before.get(key) !== value).map(([key]) => key).sort(),
  };
}

export function diffModels(previous: ProjectModel, next: ProjectModel): Omit<ModelDelta, "impact" | "fromRevision" | "toRevision"> {
  const fileState = (model: ProjectModel) => keyed(model.files, (file) => file.path, (file) => `${file.bytes}:${file.hash ?? ""}`);
  const symbolState = (model: ProjectModel) => keyed(model.symbols, (symbol) => symbol.id, (symbol) => symbol.hash);
  const files = compare(fileState(previous), fileState(next));
  const symbols = compare(symbolState(previous), symbolState(next));
  return { files, symbols: { added: symbols.added, removed: symbols.removed, modified: symbols.changed } };
}
