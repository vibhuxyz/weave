import { buildProjectModel, type BuildModelOptions, type BuildStats } from "../build-model.ts";
import { analyzeImpact } from "../impact/index.ts";
import type { ProjectModel } from "../types.ts";
import { diffModels } from "./diff-models.ts";
import type { ModelDelta } from "./types.ts";

export interface ModelUpdate {
  readonly model: ProjectModel;
  readonly delta: ModelDelta;
  readonly stats: BuildStats;
}

export async function updateProjectModel(previous: ProjectModel, options: Omit<BuildModelOptions, "revision">): Promise<ModelUpdate> {
  const { model: built, stats } = await buildProjectModel({ ...options, revision: previous.revision + 1 });
  const changes = diffModels(previous, built);
  const touchedSymbols = [...changes.symbols.added, ...changes.symbols.modified, ...changes.symbols.removed];
  const isUnchanged = touchedSymbols.length === 0 && changes.files.added.length + changes.files.removed.length + changes.files.changed.length === 0;
  const model = isUnchanged ? { ...built, revision: previous.revision } : built;
  const impactModel = { ...model, dependencies: { ...model.dependencies, calls: [...previous.dependencies.calls, ...model.dependencies.calls] } };
  const impact = analyzeImpact(impactModel, { files: [...changes.files.added, ...changes.files.changed, ...changes.files.removed], symbols: touchedSymbols });
  return { model, delta: { fromRevision: previous.revision, toRevision: model.revision, ...changes, impact }, stats };
}
