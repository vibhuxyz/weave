import { buildSkillRegistry, queryProject, renderSkills, resolveSkills, selectSkills } from "@weave/core";
import type { ProjectModelCache } from "../project-model/index.ts";

export type SkillSelector = (text: string) => Promise<string>;

export function createSkillSelector(models: ProjectModelCache): SkillSelector {
  const registry = buildSkillRegistry([]);
  return async (text) => {
    const read = await models.read();
    if (!read.ok) return renderSkills(resolveSkills(registry.skills, { text, paths: [], languages: [], frameworks: [], packages: [], layers: [] }));
    return renderSkills(selectSkills({ model: read.model, answer: queryProject(read.model, text), registry, text }));
  };
}
