import { buildSkillRegistry, queryProject, renderSkills, resolveSkills, selectSkills } from "@weave/core";
import type { SkillEntry } from "@weave/core";
import type { ProjectModelCache } from "../project-model/index.ts";
import { loadPinnedSkills, renderPinnedSkills, sanitizeSkillNames } from "../skills/index.ts";

export interface SkillSelection {
  readonly builtinSkillCatalog: string;
  readonly pinnedSkills: string;
}

export type SkillSelector = (text: string, pinnedNames?: unknown) => Promise<SkillSelection>;

export interface SkillSelectorSources {
  readonly projectSkills: readonly SkillEntry[];
  readonly skillRoots: readonly string[];
}

export function createSkillSelector(models: ProjectModelCache, sources: SkillSelectorSources): SkillSelector {
  const registry = buildSkillRegistry([]);
  const pinnedSources = { ...sources, builtinSkills: registry.skills };
  const selectBuiltin = async (text: string): Promise<string> => {
    const read = await models.read();
    if (!read.ok) return renderSkills(resolveSkills(registry.skills, { text, paths: [], languages: [], frameworks: [], packages: [], layers: [] }));
    return renderSkills(selectSkills({ model: read.model, answer: queryProject(read.model, text), registry, text }).chosen);
  };
  return async (text, pinnedNames) => {
    const [builtinSkillCatalog, pinnedLoad] = await Promise.all([
      selectBuiltin(text),
      loadPinnedSkills(sanitizeSkillNames(pinnedNames), pinnedSources),
    ]);
    return { builtinSkillCatalog, pinnedSkills: renderPinnedSkills(pinnedLoad) };
  };
}
